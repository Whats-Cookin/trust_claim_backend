import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Deduplicate edges within a node's edgesFrom/edgesTo arrays.
 * Keeps only one edge per unique (startNodeId, endNodeId, label) tuple,
 * preferring the edge with the highest claimId (most recent claim).
 */
function dedupeNodeEdges(node: any): any {
  const dedupeEdges = (edges: any[]): any[] => {
    if (!edges || edges.length === 0) return edges;

    const edgeMap = new Map<string, any>();
    for (const edge of edges) {
      const key = `${edge.startNodeId}-${edge.endNodeId}-${edge.label}`;
      const existing = edgeMap.get(key);
      if (!existing || edge.claimId > existing.claimId) {
        edgeMap.set(key, edge);
      }
    }
    return Array.from(edgeMap.values());
  };

  return {
    ...node,
    edgesFrom: dedupeEdges(node.edgesFrom || []),
    edgesTo: dedupeEdges(node.edgesTo || []),
  };
}

// Get claim graph - returns nodes directly connected to a claim
export async function getClaimGraph(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const numericClaimId = parseInt(claimId, 10);
    
    if (isNaN(numericClaimId)) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    // Get nodes connected to this claim
    const nodes = await prisma.node.findMany({
      where: {
        OR: [
          {
            edgesFrom: {
              some: {
                claimId: numericClaimId,
              },
            },
          },
          {
            edgesTo: {
              some: {
                claimId: numericClaimId,
              },
            },
          },
        ],
      },
      include: {
        edgesFrom: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
          take: 50
        },
        edgesTo: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
          take: 50
        },
      },
    });

    // Deduplicate edges for cleaner graph visualization
    const dedupedNodes = nodes.map(dedupeNodeEdges);

    return res.json({
      nodes: dedupedNodes,
      count: dedupedNodes.length,
    });
  } catch (error) {
    console.error('Error fetching claim graph:', error);
    return res.status(500).json({ error: 'Failed to fetch claim graph' });
  }
}

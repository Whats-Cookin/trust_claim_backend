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

    // Group edges by (startNodeId, endNodeId, label)
    const edgeMap = new Map<string, any>();
    for (const edge of edges) {
      const key = `${edge.startNodeId}-${edge.endNodeId}-${edge.label}`;
      const existing = edgeMap.get(key);
      // Keep the edge with the highest claimId (most recent)
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

// Simple backwards-compatible graph endpoint
export async function getGraph(req: Request, res: Response): Promise<Response | void> {
  try {
    const { uri } = req.params;
    
    // Check if it's a numeric ID (claim ID)
    const isNumericId = /^\d+$/.test(uri);
    
    if (isNumericId) {
      const claimId = parseInt(uri, 10);
      
      // Get nodes connected to this claim
      const nodes = await prisma.node.findMany({
        where: {
          OR: [
            {
              edgesFrom: {
                some: {
                  claimId: claimId,
                },
              },
            },
            {
              edgesTo: {
                some: {
                  claimId: claimId,
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

      // Return simple format expected by frontend
      return res.json({
        nodes: dedupedNodes,
        count: dedupedNodes.length
      });
    }

    // Handle URI case - find claims about this URI
    const claims = await prisma.claim.findMany({
      where: {
        OR: [
          { subject: uri },
          { object: uri },
          { sourceURI: uri }
        ]
      },
      take: 10
    });
    
    if (claims.length === 0) {
      return res.status(404).json({ error: 'No claims found for this URI' });
    }
    
    // Get nodes for these claims
    const nodes = await prisma.node.findMany({
      where: {
        OR: claims.map(claim => ({
          OR: [
            {
              edgesFrom: {
                some: {
                  claimId: claim.id,
                },
              },
            },
            {
              edgesTo: {
                some: {
                  claimId: claim.id,
                },
              },
            },
          ],
        })).flat()
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
      count: dedupedNodes.length
    });
  } catch (error) {
    console.error('Error fetching graph:', error);
    return res.status(500).json({ error: 'Failed to fetch graph' });
  }
}

// Export other functions from the modular files
export { getClaimGraph } from './graphClaim';
export { getNodeById, expandNode, searchNodes } from './graphNode';
export { getNodesByClaimIds } from './graphBatch';

// Deprecated
export async function getFullGraph(_req: Request, res: Response): Promise<Response | void> {
  return res.status(400).json({ 
    error: 'Full graph endpoint is deprecated. Please use /api/claim_graph/:claimId with a specific starting point.' 
  });
}

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Get claim graph - returns nodes directly connected to a claim
export async function getClaimGraph(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const numericClaimId = parseInt(claimId, 10);
    
    if (isNaN(numericClaimId)) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    // First get edges for this claim to find connected nodes
    const claimEdges = await prisma.edge.findMany({
      where: { claimId: numericClaimId },
      select: { startNodeId: true, endNodeId: true }
    });

    // Extract unique node IDs
    const nodeIds = new Set<number>();
    claimEdges.forEach(e => {
      nodeIds.add(e.startNodeId);
      nodeIds.add(e.endNodeId);
    });

    if (nodeIds.size === 0) {
      return res.json({ nodes: [], count: 0 });
    }

    // Get all nodes and their edges
    const nodes = await prisma.node.findMany({
      where: {
        id: { in: Array.from(nodeIds) }
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

    return res.json({
      nodes: nodes,
      count: nodes.length,
    });
  } catch (error) {
    console.error('Error fetching claim graph:', error);
    return res.status(500).json({ error: 'Failed to fetch claim graph' });
  }
}

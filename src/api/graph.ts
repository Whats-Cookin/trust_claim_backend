import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Helper function to check if CLAIM nodes are attested.
 * A claim is attested if it's referenced as the object of another claim.
 */
async function checkIsAttested(nodeIds: number[]): Promise<Set<number>> {
  const attestedClaims = await prisma.edge.findMany({
    where: {
      endNodeId: { in: nodeIds },
      label: 'object',
      endNode: { entType: 'CLAIM' }
    },
    select: { endNodeId: true },
    distinct: ['endNodeId']
  });

  return new Set(attestedClaims.map(e => e.endNodeId).filter((id): id is number => id !== null));
}

// Simple backwards-compatible graph endpoint
export async function getGraph(req: Request, res: Response): Promise<Response | void> {
  try {
    const { uri } = req.params;
    
    // Check if it's a numeric ID (claim ID)
    const isNumericId = /^\d+$/.test(uri);
    
    if (isNumericId) {
      const claimId = parseInt(uri, 10);

      // First get edges for this claim to find connected nodes
      const claimEdges = await prisma.edge.findMany({
        where: { claimId },
        select: { startNodeId: true, endNodeId: true }
      });

      // Extract unique node IDs
      const nodeIds = new Set<number>();
      claimEdges.forEach(e => {
        nodeIds.add(e.startNodeId);
        if (e.endNodeId !== null) {
          nodeIds.add(e.endNodeId);
        }
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
              startNode: true,
              endNode: true,
            },
            take: 50
          },
          edgesTo: {
            include: {
              startNode: true,
              endNode: true,
            },
            take: 50
          },
        },
      });

      // Check which CLAIM nodes are attested
      const attestedSet = await checkIsAttested(Array.from(nodeIds));

      // Add isAttested flag to all nodes
      const nodesWithFlags = nodes.map(node => ({
        ...node,
        isAttested: node.entType === 'CLAIM' && attestedSet.has(node.id)
      }));

      // Return simple format expected by frontend
      return res.json({
        nodes: nodesWithFlags,
        count: nodesWithFlags.length
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

    // Check which CLAIM nodes are attested
    const nodeIds = nodes.map(n => n.id);
    const attestedSet = await checkIsAttested(nodeIds);

    // Add isAttested flag to all nodes
    const nodesWithFlags = nodes.map(node => ({
      ...node,
      isAttested: node.entType === 'CLAIM' && attestedSet.has(node.id)
    }));

    return res.json({
      nodes: nodesWithFlags,
      count: nodesWithFlags.length
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

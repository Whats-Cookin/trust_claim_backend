import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

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
      
      // Return simple format expected by frontend
      return res.json({
        nodes: nodes,
        count: nodes.length
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
    
    return res.json({
      nodes: nodes,
      count: nodes.length
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

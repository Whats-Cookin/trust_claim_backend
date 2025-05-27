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

    return res.json({
      nodes: nodes,
      count: nodes.length,
    });
  } catch (error) {
    console.error('Error fetching claim graph:', error);
    return res.status(500).json({ error: 'Failed to fetch claim graph' });
  }
}

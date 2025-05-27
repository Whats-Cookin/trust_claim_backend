import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Get nodes by multiple claim IDs - useful for batch expansion
export async function getNodesByClaimIds(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimIds } = req.body;
    
    if (!Array.isArray(claimIds) || claimIds.length === 0) {
      return res.status(400).json({ error: 'claimIds array required' });
    }

    const numericClaimIds = claimIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    
    if (numericClaimIds.length === 0) {
      return res.status(400).json({ error: 'No valid claim IDs provided' });
    }

    // Limit the number of claims to prevent abuse
    if (numericClaimIds.length > 50) {
      return res.status(400).json({ error: 'Too many claim IDs. Maximum 50 allowed.' });
    }

    // Get edges for these specific claims
    const edges = await prisma.edge.findMany({
      where: {
        claimId: { in: numericClaimIds }
      },
      include: {
        startNode: {
          select: {
            id: true,
            nodeUri: true,
            name: true,
            entType: true
          }
        },
        endNode: {
          select: {
            id: true,
            nodeUri: true,
            name: true,
            entType: true
          }
        },
        claim: {
          select: {
            id: true,
            claim: true,
            confidence: true,
            effectiveDate: true
          }
        }
      }
    });

    // Collect unique nodes
    const nodeMap = new Map();
    edges.forEach(edge => {
      if (!nodeMap.has(edge.startNodeId)) {
        nodeMap.set(edge.startNodeId, edge.startNode);
      }
      if (edge.endNodeId && !nodeMap.has(edge.endNodeId)) {
        nodeMap.set(edge.endNodeId, edge.endNode);
      }
    });

    return res.json({
      nodes: Array.from(nodeMap.values()),
      edges: edges.map(e => ({
        id: e.id,
        source: e.startNodeId,
        target: e.endNodeId,
        label: e.label,
        claimId: e.claimId
      })),
      claimIds: numericClaimIds,
    });
  } catch (error) {
    console.error('Error fetching nodes by claim IDs:', error);
    return res.status(500).json({ error: 'Failed to fetch nodes' });
  }
}

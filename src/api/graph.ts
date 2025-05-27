import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enhanceNodesWithEntities } from '../services/graphBuilder';

// Get claim graph - returns all nodes connected to a claim with ALL their edges
export async function getClaimGraph(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const numericClaimId = parseInt(claimId, 10);
    
    if (isNaN(numericClaimId)) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    // Find all nodes involved with this claim
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
        // Include ALL edges connected to these nodes - this is key for expansion
        edgesFrom: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
        },
        edgesTo: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
        },
      },
    });

    // Debug logging
    console.log(`Found ${nodes.length} nodes for claim ${numericClaimId}`);
    nodes.forEach((node) => {
      console.log(`Node ${node.id} (${node.name}):`);
      console.log(`  ${node.edgesFrom.length} outgoing edges`);
      console.log(`  ${node.edgesTo.length} incoming edges`);
    });

    // Enhance with entity data if available
    const enhanced = await enhanceNodesWithEntities(nodes as any);

    return res.json({
      nodes: enhanced,
      count: nodes.length,
    });
  } catch (error) {
    console.error('Error fetching claim graph:', error);
    return res.status(500).json({ error: 'Failed to fetch claim graph' });
  }
}

// Get node by ID with all its edges - useful for expansion
export async function getNodeById(req: Request, res: Response): Promise<Response | void> {
  try {
    const { nodeId } = req.params;
    const numericNodeId = parseInt(nodeId, 10);
    
    if (isNaN(numericNodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    const node = await prisma.node.findUnique({
      where: {
        id: numericNodeId,
      },
      include: {
        edgesFrom: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
        },
        edgesTo: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
        },
      },
    });

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Enhance with entity data
    const enhanced = await enhanceNodesWithEntities([node] as any);

    return res.json(enhanced[0] || node);
  } catch (error) {
    console.error('Error fetching node:', error);
    return res.status(500).json({ error: 'Failed to fetch node' });
  }
}

// Search nodes
export async function searchNodes(req: Request, res: Response): Promise<Response | void> {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    
    if (!search) {
      return res.status(400).json({ error: 'Search term required' });
    }

    const searchTerm = decodeURIComponent(search.toString());
    
    const query = {
      OR: [
        { id: { equals: parseInt(searchTerm, 10) || -1 } },
        { name: { contains: searchTerm, mode: 'insensitive' as const } },
        { descrip: { contains: searchTerm, mode: 'insensitive' as const } },
        { nodeUri: { contains: searchTerm, mode: 'insensitive' as const } },
      ],
    };

    const nodes = await prisma.node.findMany({
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      where: query,
      include: {
        edgesFrom: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
        },
        edgesTo: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
        },
      },
    });

    const count = await prisma.node.count({ where: query });

    // Enhance with entity data
    const enhanced = await enhanceNodesWithEntities(nodes as any);

    return res.json({ nodes: enhanced, count });
  } catch (error) {
    console.error('Error searching nodes:', error);
    return res.status(500).json({ error: 'Failed to search nodes' });
  }
}

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

    // Find all nodes involved with these claims
    const nodes = await prisma.node.findMany({
      where: {
        OR: [
          {
            edgesFrom: {
              some: {
                claimId: {
                  in: numericClaimIds,
                },
              },
            },
          },
          {
            edgesTo: {
              some: {
                claimId: {
                  in: numericClaimIds,
                },
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
        },
        edgesTo: {
          include: {
            claim: true,
            startNode: true,
            endNode: true,
          },
        },
      },
    });

    // Enhance with entity data
    const enhanced = await enhanceNodesWithEntities(nodes as any);

    return res.json({
      nodes: enhanced,
      count: nodes.length,
      claimIds: numericClaimIds,
    });
  } catch (error) {
    console.error('Error fetching nodes by claim IDs:', error);
    return res.status(500).json({ error: 'Failed to fetch nodes' });
  }
}

// DEPRECATED: This endpoint should not be used
export async function getFullGraph(_req: Request, res: Response): Promise<Response | void> {
  return res.status(400).json({ 
    error: 'Full graph endpoint is deprecated. Please use /api/claim_graph/:claimId with a specific starting point.' 
  });
}

// Alias for backwards compatibility
export const getGraph = getClaimGraph;

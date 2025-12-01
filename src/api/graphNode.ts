import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Helper function to check if a CLAIM node is attested (referenced as object of another claim).
 * For the new claims-as-nodes model, this determines visualization mode.
 */
async function checkIsAttested(nodeIds: number[]): Promise<Set<number>> {
  const attestedClaims = await prisma.edge.findMany({
    where: {
      endNodeId: { in: nodeIds },
      label: 'object',  // Claims referenced as objects are attested
      endNode: { entType: 'CLAIM' }  // Only check CLAIM nodes
    },
    select: { endNodeId: true },
    distinct: ['endNodeId']
  });

  return new Set(attestedClaims.map(e => e.endNodeId).filter((id): id is number => id !== null));
}

// Get node by ID with limited edges
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
            endNode: true,
          },
          take: 20
        },
        edgesTo: {
          include: {
            startNode: true,
          },
          take: 20
        },
      },
    });

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Collect all node IDs to check for attestations
    const nodeIds = [
      node.id,
      ...node.edgesFrom.map(e => e.endNode?.id).filter(id => id !== undefined),
      ...node.edgesTo.map(e => e.startNode?.id).filter(id => id !== undefined)
    ];

    const attestedSet = await checkIsAttested(nodeIds);

    // Add isAttested flag to main node
    const nodeWithFlag = {
      ...node,
      isAttested: node.entType === 'CLAIM' && attestedSet.has(node.id),
      edgesFrom: node.edgesFrom.map(e => ({
        ...e,
        endNode: e.endNode ? {
          ...e.endNode,
          isAttested: e.endNode.entType === 'CLAIM' && attestedSet.has(e.endNode.id)
        } : null
      })),
      edgesTo: node.edgesTo.map(e => ({
        ...e,
        startNode: {
          ...e.startNode,
          isAttested: e.startNode.entType === 'CLAIM' && attestedSet.has(e.startNode.id)
        }
      }))
    };

    return res.json(nodeWithFlag);
  } catch (error) {
    console.error('Error fetching node:', error);
    return res.status(500).json({ error: 'Failed to fetch node' });
  }
}

// Get expanded view for a node
export async function expandNode(req: Request, res: Response): Promise<Response | void> {
  try {
    const { nodeId } = req.params;
    const { limit = 20 } = req.query;
    const numericNodeId = parseInt(nodeId, 10);
    
    if (isNaN(numericNodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    const node = await prisma.node.findUnique({
      where: { id: numericNodeId },
      include: {
        edgesFrom: {
          include: {
            endNode: true,
          },
          take: Number(limit),
          orderBy: { id: 'desc' }
        },
        edgesTo: {
          include: {
            startNode: true,
          },
          take: Number(limit),
          orderBy: { id: 'desc' }
        }
      }
    });

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Collect all node IDs to check for attestations
    const nodeIds = [
      node.id,
      ...node.edgesFrom.map(e => e.endNode?.id).filter(id => id !== undefined),
      ...node.edgesTo.map(e => e.startNode?.id).filter(id => id !== undefined)
    ];

    const attestedSet = await checkIsAttested(nodeIds);

    // Add isAttested flag to main node and all connected nodes
    const nodeWithFlag = {
      ...node,
      isAttested: node.entType === 'CLAIM' && attestedSet.has(node.id),
      edgesFrom: node.edgesFrom.map(e => ({
        ...e,
        endNode: e.endNode ? {
          ...e.endNode,
          isAttested: e.endNode.entType === 'CLAIM' && attestedSet.has(e.endNode.id)
        } : null
      })),
      edgesTo: node.edgesTo.map(e => ({
        ...e,
        startNode: {
          ...e.startNode,
          isAttested: e.startNode.entType === 'CLAIM' && attestedSet.has(e.startNode.id)
        }
      }))
    };

    return res.json(nodeWithFlag);
  } catch (error) {
    console.error('Error expanding node:', error);
    return res.status(500).json({ error: 'Failed to expand node' });
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
    
    const nodes = await prisma.node.findMany({
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      where: {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { descrip: { contains: searchTerm, mode: 'insensitive' } },
          { nodeUri: { contains: searchTerm, mode: 'insensitive' } },
        ],
      },
      include: {
        _count: {
          select: {
            edgesFrom: true,
            edgesTo: true
          }
        }
      }
    });

    const count = await prisma.node.count({ 
      where: {
        OR: [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { descrip: { contains: searchTerm, mode: 'insensitive' } },
          { nodeUri: { contains: searchTerm, mode: 'insensitive' } },
        ],
      }
    });

    return res.json({ nodes, count });
  } catch (error) {
    console.error('Error searching nodes:', error);
    return res.status(500).json({ error: 'Failed to search nodes' });
  }
}

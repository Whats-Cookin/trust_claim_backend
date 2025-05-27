import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

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
            claim: true,
            endNode: true,
          },
          take: 20
        },
        edgesTo: {
          include: {
            claim: true,
            startNode: true,
          },
          take: 20
        },
      },
    });

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    return res.json(node);
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
            claim: true,
            endNode: true,
          },
          take: Number(limit),
          orderBy: { id: 'desc' }
        },
        edgesTo: {
          include: {
            claim: true,
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

    return res.json(node);
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

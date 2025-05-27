import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enhanceNodesWithEntities } from '../services/graphBuilder';

// Get claim graph - returns nodes directly connected to a claim
export async function getClaimGraph(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const numericClaimId = parseInt(claimId, 10);
    
    if (isNaN(numericClaimId)) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    // First, get just the edges for this specific claim
    const claimEdges = await prisma.edge.findMany({
      where: {
        claimId: numericClaimId
      },
      include: {
        startNode: true,
        endNode: true,
        claim: {
          select: {
            id: true,
            claim: true,
            subject: true,
            object: true,
            confidence: true,
            effectiveDate: true,
            sourceURI: true,
            issuerId: true
          }
        }
      }
    });

    // Collect unique node IDs from the claim's edges
    const nodeIds = new Set<number>();
    claimEdges.forEach(edge => {
      nodeIds.add(edge.startNodeId);
      if (edge.endNodeId) nodeIds.add(edge.endNodeId);
    });

    // Now get those nodes with a reasonable number of their edges
    const nodes = await prisma.node.findMany({
      where: {
        id: {
          in: Array.from(nodeIds)
        }
      },
      include: {
        edgesFrom: {
          include: {
            claim: {
              select: {
                id: true,
                claim: true,
                confidence: true,
                effectiveDate: true,
                subject: true,
                object: true
              }
            },
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
          },
          take: 50,  // Limit edges per node
          orderBy: {
            id: 'desc'  // Most recent edges
          }
        },
        edgesTo: {
          include: {
            claim: {
              select: {
                id: true,
                claim: true,
                confidence: true,
                effectiveDate: true,
                subject: true,
                object: true
              }
            },
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
          },
          take: 50,  // Limit edges per node
          orderBy: {
            id: 'desc'  // Most recent edges
          }
        },
      },
    });

    console.log(`Claim ${numericClaimId}: ${claimEdges.length} direct edges, ${nodes.length} nodes`);

    // Build a focused response
    const response = {
      claimId: numericClaimId,
      directEdges: claimEdges.map(edge => ({
        id: edge.id,
        source: edge.startNodeId,
        target: edge.endNodeId,
        label: edge.label,
        claimId: edge.claimId
      })),
      nodes: nodes.map(node => ({
        ...node,
        edgeCount: {
          from: node.edgesFrom.length,
          to: node.edgesTo.length
        }
      })),
      stats: {
        nodeCount: nodes.length,
        directEdgeCount: claimEdges.length,
        totalEdgeCount: nodes.reduce((sum, n) => sum + n.edgesFrom.length + n.edgesTo.length, 0)
      }
    };

    return res.json(response);
  } catch (error) {
    console.error('Error fetching claim graph:', error);
    return res.status(500).json({ error: 'Failed to fetch claim graph' });
  }
}

// Get expanded view for a node - used when clicking to expand
export async function expandNode(req: Request, res: Response): Promise<Response | void> {
  try {
    const { nodeId } = req.params;
    const { limit = 20 } = req.query;
    const numericNodeId = parseInt(nodeId, 10);
    
    if (isNaN(numericNodeId)) {
      return res.status(400).json({ error: 'Invalid node ID' });
    }

    // Get the node with more of its edges
    const node = await prisma.node.findUnique({
      where: { id: numericNodeId },
      include: {
        edgesFrom: {
          include: {
            claim: {
              select: {
                id: true,
                claim: true,
                confidence: true,
                effectiveDate: true
              }
            },
            endNode: {
              select: {
                id: true,
                nodeUri: true,
                name: true,
                entType: true
              }
            }
          },
          take: Number(limit),
          orderBy: { id: 'desc' }
        },
        edgesTo: {
          include: {
            claim: {
              select: {
                id: true,
                claim: true,
                confidence: true,
                effectiveDate: true
              }
            },
            startNode: {
              select: {
                id: true,
                nodeUri: true,
                name: true,
                entType: true
              }
            }
          },
          take: Number(limit),
          orderBy: { id: 'desc' }
        }
      }
    });

    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Get the connected nodes that weren't in the original query
    const connectedNodeIds = new Set<number>();
    node.edgesFrom.forEach(e => e.endNodeId && connectedNodeIds.add(e.endNodeId));
    node.edgesTo.forEach(e => connectedNodeIds.add(e.startNodeId));

    const connectedNodes = await prisma.node.findMany({
      where: {
        id: { in: Array.from(connectedNodeIds) }
      },
      select: {
        id: true,
        nodeUri: true,
        name: true,
        entType: true,
        descrip: true,
        thumbnail: true
      }
    });

    return res.json({
      expandedNode: node,
      connectedNodes,
      stats: {
        edgesShown: node.edgesFrom.length + node.edgesTo.length,
        connectedNodes: connectedNodes.length
      }
    });
  } catch (error) {
    console.error('Error expanding node:', error);
    return res.status(500).json({ error: 'Failed to expand node' });
  }
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
            claim: {
              select: {
                id: true,
                claim: true,
                confidence: true,
                effectiveDate: true
              }
            },
            endNode: {
              select: {
                id: true,
                nodeUri: true,
                name: true,
                entType: true
              }
            }
          },
          take: 20
        },
        edgesTo: {
          include: {
            claim: {
              select: {
                id: true,
                claim: true,
                confidence: true,
                effectiveDate: true
              }
            },
            startNode: {
              select: {
                id: true,
                nodeUri: true,
                name: true,
                entType: true
              }
            }
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
      select: {
        id: true,
        nodeUri: true,
        name: true,
        entType: true,
        descrip: true,
        thumbnail: true,
        _count: {
          select: {
            edgesFrom: true,
            edgesTo: true
          }
        }
      }
    });

    const count = await prisma.node.count({ where: query });

    return res.json({ 
      nodes: nodes.map(n => ({
        ...n,
        edgeCount: n._count.edgesFrom + n._count.edgesTo
      })), 
      count 
    });
  } catch (error) {
    console.error('Error searching nodes:', error);
    return res.status(500).json({ error: 'Failed to search nodes' });
  }
}

// DEPRECATED: This endpoint should not be used
export async function getFullGraph(_req: Request, res: Response): Promise<Response | void> {
  return res.status(400).json({ 
    error: 'Full graph endpoint is deprecated. Please use /api/claim_graph/:claimId with a specific starting point.' 
  });
}

// Backwards compatibility - handle both claim IDs and URIs
export async function getGraph(req: Request, res: Response): Promise<Response | void> {
  try {
    const { uri } = req.params;
    
    // Check if it's a numeric ID (claim ID)
    const isNumericId = /^\d+$/.test(uri);
    
    if (isNumericId) {
      // Forward to claim graph handler
      req.params.claimId = uri;
      return getClaimGraph(req, res);
    }
    
    // Otherwise, treat as a URI and find claims about it
    const claims = await prisma.claim.findMany({
      where: {
        OR: [
          { subject: uri },
          { object: uri },
          { sourceURI: uri }
        ]
      },
      take: 10  // Limit to prevent too many
    });
    
    if (claims.length === 0) {
      return res.status(404).json({ error: 'No claims found for this URI' });
    }
    
    // Get nodes for these claims
    const claimIds = claims.map(c => c.id);
    const edges = await prisma.edge.findMany({
      where: {
        claimId: { in: claimIds }
      },
      include: {
        startNode: true,
        endNode: true,
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
    
    // Return in expected format
    return res.json({
      nodes: Array.from(nodeMap.values()),
      edges: edges.map(e => ({
        id: e.id,
        source: e.startNodeId,
        target: e.endNodeId,
        label: e.label,
        claim: e.claim
      })),
      uri,
      claimCount: claims.length
    });
  } catch (error) {
    console.error('Error fetching graph:', error);
    return res.status(500).json({ error: 'Failed to fetch graph' });
  }
}

// Re-export for routes
export { getNodesByClaimIds } from './graphBatch';

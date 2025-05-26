import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { enhanceNodesWithEntities } from '../services/graphBuilder';

// Get graph for a URI
export async function getGraph(req: Request, res: Response) {
  try {
    const { uri } = req.params;
    const { depth = 1 } = req.query;
    
    // Get all claims involving this URI
    const claims = await prisma.claim.findMany({
      where: {
        OR: [
          { subject: uri },
          { object: uri },
          { sourceURI: uri }
        ]
      }
    });
    
    // Get nodes for these claims
    const nodes = await prisma.node.findMany({
      where: {
        OR: [
          { nodeUri: uri },
          { 
            edgesFrom: { 
              some: { 
                claim: { 
                  id: { in: claims.map(c => c.id) } 
                } 
              } 
            } 
          },
          { 
            edgesTo: { 
              some: { 
                claim: { 
                  id: { in: claims.map(c => c.id) } 
                } 
              } 
            } 
          }
        ]
      },
      include: {
        edgesFrom: { 
          include: { 
            endNode: true, 
            claim: true 
          } 
        },
        edgesTo: { 
          include: { 
            startNode: true, 
            claim: true 
          } 
        }
      }
    });
    
    // Enhance with entity data - handle nodes that might not have edgesTo
    const enhanced = await enhanceNodesWithEntities(nodes as any);
    
    // Build graph structure
    const graph = {
      nodes: enhanced,
      edges: nodes.flatMap(node => [
        ...node.edgesFrom.map(edge => ({
          id: edge.id,
          source: edge.startNodeId,
          target: edge.endNodeId,
          label: edge.label,
          claim: edge.claim
        })),
        ...node.edgesTo.map(edge => ({
          id: edge.id,
          source: edge.startNodeId,
          target: edge.endNodeId,
          label: edge.label,
          claim: edge.claim
        }))
      ]),
      // Remove duplicates
      get uniqueEdges() {
        const seen = new Set();
        return this.edges.filter(edge => {
          const key = `${edge.source}-${edge.target}-${edge.label}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    };
    
    res.json({ 
      nodes: graph.nodes,
      edges: graph.uniqueEdges,
      uri,
      depth: Number(depth)
    });
  } catch (error) {
    console.error('Error fetching graph:', error);
    res.status(500).json({ error: 'Failed to fetch graph' });
  }
}

// Get full graph (limited for performance)
export async function getFullGraph(req: Request, res: Response) {
  try {
    const { limit = 100 } = req.query;
    
    // Get recent nodes with edges
    const nodes = await prisma.node.findMany({
      take: Number(limit),
      orderBy: { id: 'desc' },
      include: {
        edgesFrom: {
          include: {
            endNode: true,
            claim: true
          }
        }
      }
    });
    
    // Enhance with entity data - handle nodes that might not have edgesTo
    const enhanced = await enhanceNodesWithEntities(nodes as any);
    
    // Build edge list
    const edges = nodes.flatMap(node => 
      node.edgesFrom.map(edge => ({
        id: edge.id,
        source: edge.startNodeId,
        target: edge.endNodeId,
        label: edge.label,
        claim: edge.claim
      }))
    );
    
    res.json({ 
      nodes: enhanced,
      edges,
      totalNodes: await prisma.node.count(),
      totalEdges: await prisma.edge.count()
    });
  } catch (error) {
    console.error('Error fetching full graph:', error);
    res.status(500).json({ error: 'Failed to fetch graph' });
  }
}

// Get neighbors of a node
export async function getNeighbors(req: Request, res: Response): Promise<void> {
  try {
    const { nodeId } = req.params;
    
    const node = await prisma.node.findUnique({
      where: { id: parseInt(nodeId) },
      include: {
        edgesFrom: {
          include: {
            endNode: true,
            claim: true
          }
        },
        edgesTo: {
          include: {
            startNode: true,
            claim: true
          }
        }
      }
    });
    
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    
    // Collect neighbor nodes
    const neighborNodes = [
      ...node.edgesFrom.map(e => e.endNode).filter(Boolean),
      ...node.edgesTo.map(e => e.startNode)
    ] as any[];
    
    // Enhance with entity data - handle nodes that might not have full edge relations
    const enhanced = await enhanceNodesWithEntities(neighborNodes as any);
    
    res.json({
      node,
      neighbors: enhanced,
      outgoingEdges: node.edgesFrom,
      incomingEdges: node.edgesTo
    });
  } catch (error) {
    console.error('Error fetching neighbors:', error);
    res.status(500).json({ error: 'Failed to fetch neighbors' });
  }
}

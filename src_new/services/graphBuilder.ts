import { Node, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

// Type for node with edges
type NodeWithEdges = Prisma.NodeGetPayload<{
  include: {
    edgesFrom: {
      include: {
        endNode: true;
        claim: true;
      };
    };
    edgesTo: {
      include: {
        startNode: true;
        claim: true;
      };
    };
  };
}>;

// Enhanced node type
export interface EnhancedNode extends NodeWithEdges {
  entityType?: string;
  entityData?: any;
  displayName?: string;
}

export async function enhanceNodesWithEntities(nodes: NodeWithEdges[]): Promise<EnhancedNode[]> {
  if (nodes.length === 0) return [];
  
  const uris = [...new Set(nodes.map(n => n.nodeUri))];
  
  // Get all entity info
  const entities = await prisma.uriEntity.findMany({
    where: { uri: { in: uris } }
  });
  
  // Create lookup map
  const entityMap = new Map(entities.map(e => [e.uri, e]));
  
  // Get entity-specific data in batches
  const credentialUris = entities
    .filter(e => e.entityType === 'CREDENTIAL')
    .map(e => e.uri);
    
  const credentials = credentialUris.length > 0 
    ? await prisma.credential.findMany({
        where: { 
          OR: [
            { id: { in: credentialUris } },
            { canonicalUri: { in: credentialUris } }
          ]
        }
      })
    : [];
    
  const credentialMap = new Map(
    credentials.flatMap(c => [
      [c.id, c],
      ...(c.canonicalUri ? [[c.canonicalUri, c]] : [])
    ])
  );
  
  // Enhance nodes
  return nodes.map(node => {
    const entity = entityMap.get(node.nodeUri);
    const enhanced: EnhancedNode = {
      ...node,
      entityType: entity?.entityType,
      displayName: entity?.name || node.name || node.nodeUri
    };
    
    // Add entity-specific data
    if (entity?.entityType === 'CREDENTIAL') {
      enhanced.entityData = credentialMap.get(node.nodeUri);
    }
    
    return enhanced;
  });
}

// Build graph from claims
export async function buildGraphFromClaims(claimIds: number[]) {
  const claims = await prisma.claim.findMany({
    where: { id: { in: claimIds } },
    include: {
      edges: {
        include: {
          startNode: true,
          endNode: true
        }
      }
    }
  });
  
  // Collect all unique nodes
  const nodeMap = new Map<string, any>();
  const edges: any[] = [];
  
  for (const claim of claims) {
    for (const edge of claim.edges) {
      // Add nodes to map
      if (!nodeMap.has(edge.startNode.nodeUri)) {
        nodeMap.set(edge.startNode.nodeUri, edge.startNode);
      }
      if (!nodeMap.has(edge.endNode.nodeUri)) {
        nodeMap.set(edge.endNode.nodeUri, edge.endNode);
      }
      
      // Add edge
      edges.push({
        id: edge.id,
        source: edge.startNode.nodeUri,
        target: edge.endNode.nodeUri,
        label: edge.label,
        claimId: claim.id,
        confidence: claim.confidence
      });
    }
  }
  
  const nodes = Array.from(nodeMap.values());
  const enhancedNodes = await enhanceNodesWithEntities(nodes);
  
  return {
    nodes: enhancedNodes,
    edges,
    claims
  };
}

// Get connected component containing a URI
export async function getConnectedComponent(uri: string, maxDepth: number = 2) {
  const visited = new Set<string>();
  const toVisit = [{ uri, depth: 0 }];
  const nodes: any[] = [];
  const edges: any[] = [];
  
  while (toVisit.length > 0) {
    const { uri: currentUri, depth } = toVisit.shift()!;
    
    if (visited.has(currentUri) || depth > maxDepth) continue;
    visited.add(currentUri);
    
    // Get node
    const node = await prisma.node.findFirst({
      where: { nodeUri: currentUri },
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
    
    if (!node) continue;
    nodes.push(node);
    
    // Add edges and neighbors
    for (const edge of node.edgesFrom) {
      edges.push({
        id: edge.id,
        source: edge.startNode.nodeUri,
        target: edge.endNode.nodeUri,
        label: edge.label,
        claim: edge.claim
      });
      
      if (depth < maxDepth && !visited.has(edge.endNode.nodeUri)) {
        toVisit.push({ uri: edge.endNode.nodeUri, depth: depth + 1 });
      }
    }
    
    for (const edge of node.edgesTo) {
      // Avoid duplicate edges
      if (!edges.some(e => e.id === edge.id)) {
        edges.push({
          id: edge.id,
          source: edge.startNode.nodeUri,
          target: edge.endNode.nodeUri,
          label: edge.label,
          claim: edge.claim
        });
      }
      
      if (depth < maxDepth && !visited.has(edge.startNode.nodeUri)) {
        toVisit.push({ uri: edge.startNode.nodeUri, depth: depth + 1 });
      }
    }
  }
  
  const enhancedNodes = await enhanceNodesWithEntities(nodes);
  
  return {
    nodes: enhancedNodes,
    edges,
    depth: maxDepth
  };
}

// Calculate trust metrics for a node
export async function calculateTrustMetrics(nodeUri: string) {
  // Get all claims about this node
  const claims = await prisma.claim.findMany({
    where: { subject: nodeUri }
  });
  
  // Calculate metrics
  const metrics = {
    totalClaims: claims.length,
    avgConfidence: claims.reduce((sum, c) => sum + (c.confidence || 0), 0) / (claims.length || 1),
    positiveCount: 0,
    negativeCount: 0,
    neutralCount: 0,
    avgRating: 0,
    ratingCount: 0
  };
  
  // Positive claims
  const positiveClaims = ['TRUSTS', 'ENDORSES', 'CONFIRMS', 'AGREES_WITH', 'RECOMMENDS'];
  // Negative claims  
  const negativeClaims = ['DISTRUSTS', 'REFUTES', 'DISAGREES_WITH', 'WARNS_ABOUT'];
  
  let totalRating = 0;
  
  for (const claim of claims) {
    if (positiveClaims.includes(claim.claim)) {
      metrics.positiveCount++;
    } else if (negativeClaims.includes(claim.claim)) {
      metrics.negativeCount++;
    } else {
      metrics.neutralCount++;
    }
    
    // Handle ratings
    if (claim.stars) {
      totalRating += claim.stars;
      metrics.ratingCount++;
    } else if (claim.rating) {
      totalRating += claim.rating * 5; // Convert 0-1 to 0-5 scale
      metrics.ratingCount++;
    }
  }
  
  if (metrics.ratingCount > 0) {
    metrics.avgRating = totalRating / metrics.ratingCount;
  }
  
  return metrics;
}

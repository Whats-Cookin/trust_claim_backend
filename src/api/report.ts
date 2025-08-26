import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Interface for normalized subject data in reports
interface ReportSubject {
  name: string;     // resolved via priority: claim.subject.name > claim.claimName > subjectNode.name > "(Unnamed)"
  uri?: string;     // original subject URI (if any)
  type?: string;    // PERSON/ORGANIZATION/etc.
  id?: number | string;
  image?: string | null;
  thumbnail?: string | null;
}

// Helper function to resolve subject name with priority
function resolveSubjectName(claim: any, subjectNode?: any): string {
  const name =
    (claim?.subject?.name && String(claim.subject.name).trim()) ||
    (claim?.claimName && String(claim.claimName).trim()) ||
    (subjectNode?.name && String(subjectNode.name).trim()) ||
    "";
  return name || "(Unnamed)";
}

// Helper function to infer entity type from URI
function inferTypeFromUri(uri?: string): string | undefined {
  if (!uri) return undefined;
  try {
    const u = new URL(uri.trim());
    if (u.hostname.includes("linkedin.com")) {
      if (u.pathname.startsWith("/in/")) return "PERSON";
      if (u.pathname.startsWith("/company/")) return "ORGANIZATION";
    }
  } catch {}
  return undefined;
}

// Helper function to build normalized subject object
function buildReportSubject(claim: any, subjectNode?: any): ReportSubject {
  const uri = claim?.subject?.uri ?? subjectNode?.nodeUri ?? subjectNode?.uri ?? claim?.subject ?? null;
  const name = resolveSubjectName(claim, subjectNode);
  const type = claim?.subject?.type || subjectNode?.entType || inferTypeFromUri(uri) || undefined;

  return {
    id: subjectNode?.id ?? claim?.subject?.id ?? undefined,
    name,
    uri: uri || undefined,
    type,
    image: subjectNode?.image ?? claim?.subject?.image ?? null,
    thumbnail: subjectNode?.thumbnail ?? null
  };
}

// Get claim report with validations
export async function getClaimReport(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const claimIdNum = parseInt(claimId);
    
    // Get the claim
    const claim = await prisma.claim.findUnique({
      where: { id: claimIdNum }
    });
    
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    
    // Get all edges for this claim
    const edges = await prisma.edge.findMany({
      where: { claimId: claimIdNum },
      include: {
        startNode: true,
        endNode: true
      }
    });
    
    // Find the claim node (entType = 'CLAIM')
    let claimNodeId: number | undefined;
    for (const edge of edges) {
      if (edge.startNode?.entType === 'CLAIM') {
        claimNodeId = edge.startNode.id;
        break;
      }
      if (edge.endNode?.entType === 'CLAIM') {
        claimNodeId = edge.endNode.id;
        break;
      }
    }
    
    // Get validations - other claims where this claim node is the subject
    let validations: any[] = [];
    if (claimNodeId) {
      const validationEdges = await prisma.edge.findMany({
        where: {
          startNodeId: claimNodeId,
          claimId: { not: claimIdNum }
        },
        include: {
          claim: true,
          startNode: true,
          endNode: true
        }
      });
      
      // Transform to include image from node
      validations = validationEdges.map(edge => ({
        ...edge.claim,
        image: edge.startNode?.image || edge.endNode?.image
      }));
    }
    
    // Get related claims about same subject
    const relatedClaimsData = await prisma.claim.findMany({
      where: { 
        subject: claim.subject,
        id: { not: claimIdNum }
      },
      orderBy: { effectiveDate: 'desc' },
      take: 10
    });
    
    // Get edges for related claims to get their images
    const relatedClaimIds = relatedClaimsData.map(c => c.id);
    const relatedEdges = await prisma.edge.findMany({
      where: {
        claimId: { in: relatedClaimIds }
      },
      include: {
        startNode: true,
        endNode: true
      }
    });
    
    // Map images to related claims
    const relatedClaims = relatedClaimsData.map(relClaim => {
      const edge = relatedEdges.find(e => e.claimId === relClaim.id);
      return {
        ...relClaim,
        image: edge?.startNode?.image || edge?.endNode?.image || null
      };
    });
    
    // Get images associated with this claim from the Image table
    const images = await prisma.image.findMany({
      where: { claimId: claimIdNum }
    });
    
    // Get the main claim's image from its edges (fallback)
    const mainClaimImage = edges.find(e => e.startNode?.image || e.endNode?.image);
    const claimWithImage = {
      ...claim,
      edges,
      image: mainClaimImage?.startNode?.image || mainClaimImage?.endNode?.image || null
    };
    
    // Get the subject node if it exists
    let subjectNode = null;
    if (claim.subject) {
      subjectNode = await prisma.node.findFirst({
        where: { nodeUri: claim.subject }
      });
    }
    
    // Get entity info for subject (same logic as Feed API)
    const subjectEntity = await prisma.uriEntity.findUnique({
      where: { uri: claim.subject }
    });
    
    // Build normalized subject object with unified name resolution
    const reportSubject = buildReportSubject(
      { 
        subject: { 
          name: subjectEntity?.name || edges[0]?.startNode?.name || claim.subject,
          type: subjectEntity?.entityType || edges[0]?.startNode?.entType,
          uri: claim.subject 
        }
      }, 
      subjectNode
    );
    
    res.json({
      id: claim.id,
      subject: reportSubject, // Now returns normalized subject object with .name
      statement: claim.statement,
      effectiveDate: claim.effectiveDate,
      claim: claimWithImage,
      subjectNode,
      validations,
      validationSummary: {
        total: validations.length
      },
      relatedClaims,
      images: images.map(img => ({
        id: img.id,
        claimId: img.claimId,
        url: `/api/images/${img.id}`, // Always use the API endpoint for serving images
        digestMultibase: img.digestMultibase,
        metadata: img.metadata,
        effectiveDate: img.effectiveDate,
        createdDate: img.createdDate,
        owner: img.owner,
        signature: img.signature
      }))
    });
  } catch (error) {
    console.error('Error generating claim report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}

// Submit validation - just creates a claim about a claim
export async function submitValidation(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const { claim: claimType, confidence, statement, sourceURI } = req.body;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get the claim node URI
    const claimIdNum = parseInt(claimId);
    const edge = await prisma.edge.findFirst({
      where: { 
        claimId: claimIdNum,
        OR: [
          { startNode: { entType: 'CLAIM' } },
          { endNode: { entType: 'CLAIM' } }
        ]
      },
      include: {
        startNode: true,
        endNode: true
      }
    });
    
    if (!edge) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    
    const claimNodeUri = edge.startNode?.entType === 'CLAIM' 
      ? edge.startNode.nodeUri 
      : edge.endNode?.nodeUri;
    
    if (!claimNodeUri) {
      return res.status(500).json({ error: 'Claim node not found' });
    }
    
    // Create validation claim
    const validation = await prisma.claim.create({
      data: {
        subject: claimNodeUri,
        claim: claimType,
        statement: statement,
        issuerId: userId,
        issuerIdType: 'URL',
        sourceURI: sourceURI || userId,
        howKnown: 'FIRST_HAND',
        confidence: confidence || 1.0,
        effectiveDate: new Date()
      }
    });
    
    // Trigger pipeline
    const { PipelineTrigger } = await import('../services/pipelineTrigger');
    PipelineTrigger.processClaim(validation.id).catch(console.error);
    
    res.json({ validation });
  } catch (error) {
    console.error('Error submitting validation:', error);
    res.status(500).json({ error: 'Failed to submit validation' });
  }
}

// Get entity report
export async function getEntityReport(req: Request, res: Response): Promise<Response | void> {
  try {
    const { uri } = req.params;
    
    // Get the node
    const node = await prisma.node.findFirst({
      where: { nodeUri: uri }
    });
    
    if (!node) {
      return res.status(404).json({ error: 'Entity not found' });
    }
    
    // Get edges for this node
    const edges = await prisma.edge.findMany({
      where: {
        OR: [
          { startNodeId: node.id },
          { endNodeId: node.id }
        ]
      },
      include: {
        claim: true,
        startNode: true,
        endNode: true
      },
      orderBy: { claim: { effectiveDate: 'desc' } },
      take: 50
    });
    
    res.json({
      entity: node,
      edges,
      totalClaims: edges.length
    });
  } catch (error) {
    console.error('Error generating entity report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}

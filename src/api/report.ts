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
    
    // Get all edges for this claim (for display purposes)
    const edges = await prisma.edge.findMany({
      where: { claimId: claimIdNum },
      include: {
        startNode: true,
        endNode: true
      }
    });

    // Build all possible URIs that could reference this claim
    // Different environments use different base URLs
    const possibleClaimUris = [
      `https://live.linkedtrust.us/claims/${claimIdNum}`,
      `https://dev.linkedtrust.us/claims/${claimIdNum}`,
      `http://localhost:9000/claims/${claimIdNum}`,
      // Also check for /api/claims/ format
      `https://live.linkedtrust.us/api/claims/${claimIdNum}`,
      `https://dev.linkedtrust.us/api/claims/${claimIdNum}`,
      `http://localhost:9000/api/claims/${claimIdNum}`,
    ];

    // Get validations by querying Claims directly
    // A validation is a claim whose subject points to this claim's URI
    // and has a validation-type claim type
    const validationClaimTypes = ['validated', 'is_vouched_for', 'agree', 'verified', 'rejected', 'disagree', 'impact'];

    const validationClaims = await prisma.claim.findMany({
      where: {
        subject: { in: possibleClaimUris },
        claim: { in: validationClaimTypes },
        id: { not: claimIdNum }  // Don't include self
      },
      orderBy: { effectiveDate: 'desc' }
    });

    // Get issuer info for each validation (try to get name from nodes or entities)
    const validations = await Promise.all(validationClaims.map(async (valClaim) => {
      // Try to get issuer name from node or entity
      let issuerName = valClaim.issuerId || 'Anonymous';
      let issuerImage = null;

      if (valClaim.issuerId) {
        // Check if there's a node for this issuer
        const issuerNode = await prisma.node.findFirst({
          where: { nodeUri: valClaim.issuerId }
        });
        if (issuerNode) {
          issuerName = issuerNode.name || issuerName;
          issuerImage = issuerNode.image;
        } else {
          // Try UriEntity
          const issuerEntity = await prisma.uriEntity.findUnique({
            where: { uri: valClaim.issuerId }
          });
          if (issuerEntity) {
            issuerName = issuerEntity.name || issuerName;
            issuerImage = issuerEntity.image;
          }
        }
      }

      // Get any images/videos associated with this validation claim
      const valImages = await prisma.image.findMany({
        where: { claimId: valClaim.id }
      });

      return {
        ...valClaim,
        issuer_name: issuerName,
        image: issuerImage,
        // Include media (images and videos) from this validation
        media: valImages.map(img => {
          const metadata = img.metadata as any;
          const isVideo = metadata?.type === 'video' || img.url?.includes('.webm') || img.url?.includes('.mp4');
          const isExternalUrl = img.url?.startsWith('http');
          return {
            id: img.id,
            url: (isVideo && isExternalUrl) ? img.url : `/api/images/${img.id}`,
            metadata: img.metadata,
            type: isVideo ? 'video' : 'image'
          };
        })
      };
    }));
    
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
   // Build normalized subject object with unified name resolution
const reportSubject = buildReportSubject(
  {
    subject: {
      // Prefer the authoritative sources you already loaded
      name: (subjectEntity?.name?.trim()) || (subjectNode?.name?.trim()) || String(claim.subject),
      // Prefer Node type, then entity type, then infer from URL
      type: subjectNode?.entType || subjectEntity?.entityType || inferTypeFromUri(String(claim.subject)),
      uri: String(claim.subject)
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
        total: validations.length,
        supporting: validations.filter((v: any) => ['validated', 'is_vouched_for', 'agree', 'verified', 'impact'].includes(v.claim)).length,
        dissenting: validations.filter((v: any) => ['rejected', 'disagree'].includes(v.claim)).length,
        withVideo: validations.filter((v: any) => v.media?.some((m: any) => m.type === 'video')).length,
        withImage: validations.filter((v: any) => v.media?.some((m: any) => m.type === 'image')).length,
      },
      relatedClaims,
      images: images.map(img => {
        const metadata = img.metadata as any;
        // For videos stored externally (DO Spaces), use the original URL
        // For images, use the API endpoint
        const isVideo = metadata?.type === 'video' || img.url?.includes('.webm') || img.url?.includes('.mp4');
        const isExternalUrl = img.url?.startsWith('http');

        return {
          id: img.id,
          claimId: img.claimId,
          url: (isVideo && isExternalUrl) ? img.url : `/api/images/${img.id}`,
          digestMultibase: img.digestMultibase,
          metadata: img.metadata,
          effectiveDate: img.effectiveDate,
          createdDate: img.createdDate,
          owner: img.owner,
          signature: img.signature
        };
      })
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
    
    // NEW MODEL: Claim node URI is always /claims/{id}
    const claimIdNum = parseInt(claimId);
    const claimNodeUri = `https://live.linkedtrust.us/claims/${claimIdNum}`;

    // Verify claim node exists
    const claimNode = await prisma.node.findFirst({
      where: {
        nodeUri: claimNodeUri,
        entType: 'CLAIM'
      }
    });

    if (!claimNode) {
      return res.status(404).json({ error: 'Claim node not found. Has the pipeline processed this claim?' });
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

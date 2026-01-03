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
    
    // NEW MODEL: Claim node is always at /claims/{id} with entType = 'CLAIM'
    const claimNodeUri = `https://live.linkedtrust.us/claims/${claimIdNum}`;
    const claimNode = await prisma.node.findFirst({
      where: {
        nodeUri: claimNodeUri,
        entType: 'CLAIM'
      }
    });

    // Get all edges for this claim (for display purposes)
    const edges = await prisma.edge.findMany({
      where: { claimId: claimIdNum },
      include: {
        startNode: true,
        endNode: true
      }
    });

    // Get validations: claims whose SUBJECT edge points to this claim node
    // Validation structure: ValidationClaim.subject = claim being validated, ValidationClaim.source = validator
    let validations: any[] = [];
    if (claimNode) {
      const validationEdges = await prisma.edge.findMany({
        where: {
          endNodeId: claimNode.id,
          label: 'subject',  // Validation claims have subject pointing to the claim being validated
          claimId: { not: claimIdNum }  // Don't include self
        },
        include: {
          claim: true,
          startNode: true  // This is the validation claim node
        }
      });

      // Validation claim types - claims that attest to another claim's validity
      const supportingClaimTypes = ['validated', 'is_vouched_for', 'agree', 'verified'];
      const dissentingClaimTypes = ['rejected', 'disagree'];
      const allValidationTypes = [...supportingClaimTypes, ...dissentingClaimTypes];

      // Filter to validation-type claims only
      const validationClaims = validationEdges.filter(
        edge => edge.claim && allValidationTypes.includes(edge.claim.claim?.toLowerCase() || '')
      );

      // Get media (images/videos) for each validation claim
      const validationClaimIds = validationClaims.map(e => e.claim!.id);
      const validationMedia = await prisma.image.findMany({
        where: { claimId: { in: validationClaimIds } }
      });

      // Group media by claim ID
      const mediaByClaimId = new Map<number, any[]>();
      validationMedia.forEach(img => {
        const list = mediaByClaimId.get(img.claimId) || [];
        const metadata = img.metadata as any;
        const isVideo = metadata?.type === 'video' || img.url?.includes('.webm') || img.url?.includes('.mp4');
        list.push({
          id: img.id,
          url: img.url?.startsWith('http') ? img.url : `/api/images/${img.id}`,
          type: isVideo ? 'video' : 'image',
          metadata: img.metadata
        });
        mediaByClaimId.set(img.claimId, list);
      });

      // Transform validations with issuer info and media
      validations = validationClaims.map(edge => ({
        ...edge.claim,
        // The issuer is the person/entity who created the validation claim
        issuer_name: edge.claim?.issuerId || 'Anonymous',
        // Image from the validation claim's node (if any)
        image: edge.startNode?.image || null,
        // Media (videos/images) attached to this validation
        media: mediaByClaimId.get(edge.claim!.id) || []
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
        // Count supporting vs dissenting attestations
        supporting: validations.filter((v: any) =>
          ['validated', 'is_vouched_for', 'agree', 'verified'].includes(v.claim?.toLowerCase())
        ).length,
        dissenting: validations.filter((v: any) =>
          ['rejected', 'disagree'].includes(v.claim?.toLowerCase())
        ).length,
        // Count attestations with video evidence
        withVideo: validations.filter((v: any) =>
          v.media?.some((m: any) => m.type === 'video')
        ).length
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

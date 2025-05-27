import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Get claim report with validations
export async function getClaimReport(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    
    // Get the claim
    const claim = await prisma.claim.findUnique({
      where: { id: parseInt(claimId) },
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    
    // Get validations (claims about this claim)
    const claimUri = `${process.env.BASE_URL || 'https://linkedtrust.us'}/claims/${claimId}`;
    const validations = await prisma.claim.findMany({
      where: { subject: claimUri },
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    // Transform validations to include entity objects
    const transformedValidations = await Promise.all(validations.map(async (validation) => {
      // Get entity info for subject if it's not the claim URI
      const subjectEntity = validation.subject !== claimUri ? 
        await prisma.uriEntity.findUnique({ where: { uri: validation.subject } }) : null;
      
      const objectEntity = validation.object ? 
        await prisma.uriEntity.findUnique({ where: { uri: validation.object } }) : null;
      
      return {
        ...validation,
        subject: validation.subject === claimUri ? validation.subject : {
          uri: validation.subject,
          name: subjectEntity?.name || validation.edges?.[0]?.startNode?.name || validation.subject,
          type: subjectEntity?.entityType || validation.edges?.[0]?.startNode?.entType,
          image: subjectEntity?.image || validation.edges?.[0]?.startNode?.image
        },
        object: validation.object ? {
          uri: validation.object,
          name: objectEntity?.name || validation.edges?.[0]?.endNode?.name || validation.object,
          type: objectEntity?.entityType || validation.edges?.[0]?.endNode?.entType,
          image: objectEntity?.image || validation.edges?.[0]?.endNode?.image
        } : null
      };
    }));
    
    // Get other claims about same subject
    const relatedClaims = await prisma.claim.findMany({
      where: { 
        subject: claim.subject,
        id: { not: claim.id }
      },
      orderBy: { effectiveDate: 'desc' },
      take: 10,
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    // Transform related claims to include entity objects
    const transformedRelatedClaims = await Promise.all(relatedClaims.map(async (relClaim) => {
      const subjectEntity = await prisma.uriEntity.findUnique({ where: { uri: relClaim.subject } });
      const objectEntity = relClaim.object ? 
        await prisma.uriEntity.findUnique({ where: { uri: relClaim.object } }) : null;
      
      return {
        ...relClaim,
        subject: {
          uri: relClaim.subject,
          name: subjectEntity?.name || relClaim.edges?.[0]?.startNode?.name || relClaim.subject,
          type: subjectEntity?.entityType || relClaim.edges?.[0]?.startNode?.entType,
          image: subjectEntity?.image || relClaim.edges?.[0]?.startNode?.image
        },
        object: relClaim.object ? {
          uri: relClaim.object,
          name: objectEntity?.name || relClaim.edges?.[0]?.endNode?.name || relClaim.object,
          type: objectEntity?.entityType || relClaim.edges?.[0]?.endNode?.entType,
          image: objectEntity?.image || relClaim.edges?.[0]?.endNode?.image
        } : null
      };
    }));
    
    // Get claims by same issuer
    const issuerClaims = await prisma.claim.findMany({
      where: {
        issuerId: claim.issuerId,
        id: { not: claim.id }
      },
      orderBy: { effectiveDate: 'desc' },
      take: 5
    });
    
    // Get entity info
    const subjectEntity = await prisma.uriEntity.findUnique({
      where: { uri: claim.subject }
    });
    
    const objectEntity = claim.object ? await prisma.uriEntity.findUnique({
      where: { uri: claim.object }
    }) : null;
    
    // Transform the main claim to include entity objects
    const transformedClaim = {
      ...claim,
      subject: {
        uri: claim.subject,
        name: subjectEntity?.name || claim.edges?.[0]?.startNode?.name || claim.subject,
        type: subjectEntity?.entityType || claim.edges?.[0]?.startNode?.entType,
        image: subjectEntity?.image || claim.edges?.[0]?.startNode?.image
      },
      object: claim.object ? {
        uri: claim.object,
        name: objectEntity?.name || claim.edges?.[0]?.endNode?.name || claim.object,
        type: objectEntity?.entityType || claim.edges?.[0]?.endNode?.entType,
        image: objectEntity?.image || claim.edges?.[0]?.endNode?.image
      } : null
    };
    
    // Calculate validation summary
    const validationSummary = {
      total: validations.length,
      agrees: validations.filter(v => v.claim === 'AGREES_WITH').length,
      disagrees: validations.filter(v => v.claim === 'DISAGREES_WITH').length,
      confirms: validations.filter(v => v.claim === 'CONFIRMS').length,
      refutes: validations.filter(v => v.claim === 'REFUTES').length
    };
    
    res.json({
      claim: transformedClaim,
      validations: transformedValidations,
      validationSummary,
      relatedClaims: transformedRelatedClaims,
      issuerReputation: {
        totalClaims: issuerClaims.length + 1,
        recentClaims: issuerClaims
      },
      reportUri: claimUri
    });
  } catch (error) {
    console.error('Error generating claim report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}

// Submit validation for a claim
export async function submitValidation(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const { validationType, confidence, statement, evidence } = req.body;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Validate claim exists
    const originalClaim = await prisma.claim.findUnique({
      where: { id: parseInt(claimId) }
    });
    
    if (!originalClaim) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    
    const claimUri = `${process.env.BASE_URL || 'https://linkedtrust.us'}/claims/${claimId}`;
    
    // Map validation type to claim type
    const claimTypeMap: Record<string, string> = {
      'agree': 'AGREES_WITH',
      'disagree': 'DISAGREES_WITH',
      'confirm': 'CONFIRMS',
      'refute': 'REFUTES',
      'question': 'QUESTIONS'
    };
    
    const claimType = claimTypeMap[validationType] || 'RELATES_TO';
    
    // Create validation claim
    const validation = await prisma.claim.create({
      data: {
        subject: claimUri,
        claim: claimType,
        object: evidence?.uri || null,
        statement: statement || `${claimType} claim ${claimId}`,
        issuerId: userId,
        issuerIdType: 'URL',
        sourceURI: evidence?.sourceUri || userId,
        howKnown: evidence ? 'WEB_DOCUMENT' : 'FIRST_HAND',
        confidence: confidence || 0.8,
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

// Get entity report (all claims about an entity)
export async function getEntityReport(req: Request, res: Response) {
  try {
    const { uri } = req.params;
    
    // Get entity info
    const entity = await prisma.uriEntity.findUnique({
      where: { uri }
    });
    
    // Get all claims where entity is subject
    const subjectClaims = await prisma.claim.findMany({
      where: { subject: uri },
      orderBy: { effectiveDate: 'desc' },
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    // Get all claims where entity is object
    const objectClaims = await prisma.claim.findMany({
      where: { object: uri },
      orderBy: { effectiveDate: 'desc' },
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    // Get all claims where entity is source
    const sourceClaims = await prisma.claim.findMany({
      where: { 
        sourceURI: uri,
        NOT: {
          issuerId: uri
        }
      },
      orderBy: { effectiveDate: 'desc' }
    });
    
    // Calculate reputation metrics
    const metrics = {
      asSubject: {
        total: subjectClaims.length,
        positive: subjectClaims.filter(c => 
          ['ENDORSES', 'TRUSTS', 'CONFIRMS'].includes(c.claim) || 
          (c.stars && c.stars >= 4) ||
          (c.score !== null && c.score !== undefined && c.score >= 0.7)
        ).length,
        negative: subjectClaims.filter(c => 
          ['DISTRUSTS', 'REFUTES', 'WARNS_ABOUT'].includes(c.claim) ||
          (c.stars && c.stars <= 2) ||
          (c.score !== null && c.score !== undefined && c.score <= 0.3)
        ).length
      },
      asObject: {
        total: objectClaims.length,
        references: objectClaims.filter(c => c.claim === 'REFERS_TO').length
      },
      asSource: {
        total: sourceClaims.length,
        avgConfidence: sourceClaims.reduce((sum, c) => sum + (c.confidence || 0), 0) / (sourceClaims.length || 1)
      }
    };
    
    res.json({
      entity: entity || { uri, entityType: 'UNKNOWN' },
      metrics,
      recentClaims: {
        asSubject: subjectClaims.slice(0, 10),
        asObject: objectClaims.slice(0, 10),
        asSource: sourceClaims.slice(0, 5)
      },
      totalClaims: subjectClaims.length + objectClaims.length + sourceClaims.length
    });
  } catch (error) {
    console.error('Error generating entity report:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
}

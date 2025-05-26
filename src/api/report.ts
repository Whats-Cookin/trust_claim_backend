import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// Get claim report with validations
export async function getClaimReport(req: Request, res: Response) {
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
    
    // Calculate validation summary
    const validationSummary = {
      total: validations.length,
      agrees: validations.filter(v => v.claim === 'AGREES_WITH').length,
      disagrees: validations.filter(v => v.claim === 'DISAGREES_WITH').length,
      confirms: validations.filter(v => v.claim === 'CONFIRMS').length,
      refutes: validations.filter(v => v.claim === 'REFUTES').length
    };
    
    res.json({
      claim: {
        ...claim,
        subjectEntity,
        objectEntity
      },
      validations,
      validationSummary,
      relatedClaims,
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
export async function submitValidation(req: Request, res: Response) {
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
          (c.rating && c.rating >= 0.7)
        ).length,
        negative: subjectClaims.filter(c => 
          ['DISTRUSTS', 'REFUTES', 'WARNS_ABOUT'].includes(c.claim) ||
          (c.stars && c.stars <= 2) ||
          (c.rating && c.rating <= 0.3)
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

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../lib/auth';
import { EntityDetector } from '../services/entityDetector';
import { PipelineTrigger } from '../services/pipelineTrigger';
import { signClaimWithServerKey } from '../lib/crypto';

// Simple claim creation
export async function createClaim(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const { 
      subject, 
      claim, 
      object, 
      sourceURI, 
      howKnown, 
      confidence, 
      statement,
      aspect,
      stars,
      score,
      amt,
      unit
    } = req.body;
    
    const userId = req.user?.id || req.body.issuerId;
    
    if (!subject || !claim) {
      return res.status(400).json({ error: 'Subject and claim are required' });
    }
    
    // Determine auth method based on how the user authenticated
    let authMethod: 'google-oauth' | 'password' | 'api-token';
    if (req.user?.email && req.user?.email.includes('@')) {
      // If we have an email, likely OAuth (could be Google or other OAuth provider)
      authMethod = 'google-oauth';
    } else if (req.user?.id) {
      // If we have a user ID but no email, likely password auth
      authMethod = 'password';
    } else {
      // Otherwise, it's an API token
      authMethod = 'api-token';
    }
    
    // Prepare claim data
    const claimData = {
      subject,
      claim,
      object,
      sourceURI: sourceURI || userId,
      howKnown: howKnown || 'FIRST_HAND',
      confidence: confidence || 1.0,
      statement,
      aspect,
      stars,
      score,
      amt,
      unit,
      issuerId: userId,
      issuerIdType: 'URL' as const,
      effectiveDate: new Date()
    };
    
    // Try to sign the claim with server key, but don't fail if it doesn't work
    let proof = null;
    try {
      proof = await signClaimWithServerKey(claimData, authMethod);
    } catch (error) {
      console.error('Warning: Failed to sign claim with server key:', error);
      // Continue without proof - claim creation should not fail
    }
    
    // Create claim with proof
    const newClaim = await prisma.claim.create({
      data: {
        ...claimData,
        proof
      }
    });
    
    // Detect entities in the background
    EntityDetector.processClaimEntities(newClaim).catch(console.error);
    
    // Trigger pipeline in the background
    PipelineTrigger.processClaim(newClaim.id).catch(console.error);
    
    res.json({ claim: newClaim });
  } catch (error) {
    console.error('Error creating claim:', error);
    res.status(500).json({ error: 'Failed to create claim' });
  }
}

// Get claim by ID
export async function getClaim(req: Request, res: Response): Promise<Response | void> {
  try {
    const { id } = req.params;
    
    const claim = await prisma.claim.findUnique({
      where: { id: parseInt(id) },
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
    
    res.json({ claim });
  } catch (error) {
    console.error('Error fetching claim:', error);
    res.status(500).json({ error: 'Failed to fetch claim' });
  }
}

// Get claims for a subject
export async function getClaimsBySubject(req: Request, res: Response) {
  try {
    const { uri } = req.params;
    const { page = 1, limit = 50 } = req.query;
    
    const claims = await prisma.claim.findMany({
      where: { subject: uri },
      orderBy: { effectiveDate: 'desc' },
      skip: ((page as number) - 1) * (limit as number),
      take: limit as number,
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    res.json({ 
      claims, 
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: await prisma.claim.count({ where: { subject: uri } })
      }
    });
  } catch (error) {
    console.error('Error fetching claims by subject:', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
}

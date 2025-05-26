import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../lib/auth';
import { EntityDetector } from '../services/entityDetector';
import { PipelineTrigger } from '../services/pipelineTrigger';

// Simple claim creation
export async function createClaim(req: AuthRequest, res: Response) {
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
      rating,
      amount,
      unit
    } = req.body;
    
    const userId = req.user?.id || req.body.issuerId;
    
    if (!subject || !claim) {
      return res.status(400).json({ error: 'Subject and claim are required' });
    }
    
    // Create claim
    const newClaim = await prisma.claim.create({
      data: {
        subject,
        claim,
        object,
        sourceURI: sourceURI || userId, // Default to issuer if no source
        howKnown: howKnown || 'FIRST_HAND',
        confidence: confidence || 1.0,
        statement,
        aspect,
        stars,
        rating,
        amount,
        unit,
        issuerId: userId,
        issuerIdType: 'URL',
        effectiveDate: new Date()
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
export async function getClaim(req: Request, res: Response) {
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

import { Request, Response, RequestHandler } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../lib/auth';
import { PipelineTrigger } from '../services/pipelineTrigger';
import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
}) as unknown as { array: (fieldName: string, maxCount?: number) => RequestHandler };

// Transform v3 claim input to new format
function transformV3ToNew(v3Claim: any) {
  return {
    subject: v3Claim.subject,
    claim: v3Claim.claim,
    object: v3Claim.object,
    sourceURI: v3Claim.source_uri || v3Claim.sourceURI,
    howKnown: v3Claim.how_known || v3Claim.howKnown || 'FIRST_HAND',
    confidence: v3Claim.confidence || 1.0,
    statement: v3Claim.statement,
    aspect: v3Claim.aspect,
    stars: v3Claim.stars,
    score: v3Claim.rating, // v3 used 'rating' instead of 'score'
    amt: v3Claim.amount,   // v3 used 'amount' instead of 'amt'
    unit: v3Claim.unit,
    effectiveDate: v3Claim.effective_date || v3Claim.effectiveDate
  };
}

// Transform new claim to v3 response format
function transformNewToV3(claim: any) {
  return {
    claimId: claim.id,  // v3 used claimId instead of id
    claim_id: claim.id, // Also support underscore version
    subject: claim.subject,  // Return as string, not entity object
    claim: claim.claim,
    object: claim.object || null,  // Return as string, not entity object
    source_uri: claim.sourceURI,
    how_known: claim.howKnown,
    confidence: claim.confidence,
    statement: claim.statement,
    aspect: claim.aspect,
    stars: claim.stars,
    rating: claim.score,  // v3 used 'rating' instead of 'score'
    amount: claim.amt,    // v3 used 'amount' instead of 'amt'
    unit: claim.unit,
    effective_date: claim.effectiveDate,
    issuer_id: claim.issuerId,
    issuer_id_type: claim.issuerIdType,
    claim_address: claim.claimAddress,
    created_at: claim.createdAt,
    last_updated_at: claim.lastUpdatedAt
  };
}

// Create claim - V3 compatible endpoint
export async function createClaimV3(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const userId = req.user?.id || req.body.issuerId || req.body.issuer_id;
    
    // Transform v3 input to new format
    const transformedData = transformV3ToNew(req.body);
    
    if (!transformedData.subject || !transformedData.claim) {
      return res.status(400).json({ error: 'Subject and claim are required' });
    }
    
    // Create claim using new format
    const newClaim = await prisma.claim.create({
      data: {
        subject: transformedData.subject,
        claim: transformedData.claim,
        object: transformedData.object,
        sourceURI: transformedData.sourceURI || userId,
        howKnown: transformedData.howKnown,
        confidence: transformedData.confidence,
        statement: transformedData.statement,
        aspect: transformedData.aspect,
        stars: transformedData.stars,
        score: transformedData.score,
        amt: transformedData.amt,
        unit: transformedData.unit,
        issuerId: userId,
        issuerIdType: 'URL',
        effectiveDate: transformedData.effectiveDate ? new Date(transformedData.effectiveDate) : new Date()
      }
    });
    
    // Trigger pipeline in the background
    PipelineTrigger.processClaim(newClaim.id).catch(console.error);
    
    // Transform response back to v3 format
    const v3Response = transformNewToV3(newClaim);
    res.json(v3Response);
  } catch (error) {
    console.error('Error creating claim (v3):', error);
    res.status(500).json({ error: 'Failed to create claim' });
  }
}

// Get claim by ID - V3 compatible endpoint
export async function getClaimV3(req: Request, res: Response): Promise<Response | void> {
  try {
    const { id } = req.params;
    
    const claim = await prisma.claim.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    
    // Transform to v3 format
    const v3Response = transformNewToV3(claim);
    res.json(v3Response);
  } catch (error) {
    console.error('Error fetching claim (v3):', error);
    res.status(500).json({ error: 'Failed to fetch claim' });
  }
}

// Get claims with filters - V3 compatible endpoint
export async function getClaimsV3(req: Request, res: Response) {
  try {
    const { 
      subject, 
      object, 
      claim: claimType,
      issuer_id,
      page = '1', 
      limit = '20',
      sort = 'desc'
    } = req.query;
    
    // Parse numeric values
    const parsedPage = parseInt(page as string) || 1;
    const parsedLimit = parseInt(limit as string) || 20;
    
    // Build where clause
    const where: any = {};
    if (subject) where.subject = subject as string;
    if (object) where.object = object as string;
    if (claimType) where.claim = claimType as string;
    if (issuer_id) where.issuerId = issuer_id as string;
    
    // Get claims
    const claims = await prisma.claim.findMany({
      where,
      orderBy: { id: sort === 'asc' ? 'asc' : 'desc' },
      skip: (parsedPage - 1) * parsedLimit,
      take: parsedLimit
    });
    
    // Get total count
    const total = await prisma.claim.count({ where });
    
    // Transform all claims to v3 format
    const v3Claims = claims.map(transformNewToV3);
    
    res.json({
      claims: v3Claims,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit)
      }
    });
  } catch (error) {
    console.error('Error fetching claims (v3):', error);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
}

// Create claim with images - V3 compatible endpoint (multipart/form-data)
export const createClaimV3WithImages: RequestHandler[] = [
  upload.array('images', 10), // max 10 images
  async (req: AuthRequest, res: Response): Promise<Response | void> => {
    try {
      const userId = req.user?.id;
      const files = req.files as Express.Multer.File[];
      
      // Parse the dto from the multipart form data
      let claimData;
      try {
        claimData = JSON.parse(req.body.dto);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid dto JSON' });
      }
      
      // Transform v3 input to new format
      const transformedData = transformV3ToNew(claimData);
      
      if (!transformedData.subject || !transformedData.claim) {
        return res.status(400).json({ error: 'Subject and claim are required' });
      }
      
      // Process images
      const imageData = [];
      if (files && files.length > 0) {
        const uploadDir = path.join(process.cwd(), 'uploads');
        await fs.mkdir(uploadDir, { recursive: true });
        
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const imageInfo = claimData.images?.[i] || {};
          
          // Generate unique filename
          const fileExt = path.extname(file.originalname);
          const fileName = `${crypto.randomBytes(16).toString('hex')}${fileExt}`;
          const filePath = path.join(uploadDir, fileName);
          
          // Save file
          await fs.writeFile(filePath, file.buffer);
          
          // Generate URL (assuming local serving)
          const url = `/uploads/${fileName}`;
          
          // Generate a simple signature (in production, use proper signing)
          const signature = crypto
            .createHash('sha256')
            .update(file.buffer)
            .digest('base64');
          
          imageData.push({
            url,
            signature,
            owner: userId || 'anonymous',
            metadata: imageInfo.metadata || {},
            effectiveDate: imageInfo.effectiveDate,
            digestMultibase: imageInfo.digestMultibase || `f${signature}` // Simple multibase encoding
          });
        }
      }
      
      // Create claim using new format
      const newClaim = await prisma.claim.create({
        data: {
          subject: transformedData.subject,
          claim: transformedData.claim,
          object: transformedData.object,
          sourceURI: transformedData.sourceURI || userId,
          howKnown: transformedData.howKnown,
          confidence: transformedData.confidence,
          statement: transformedData.statement,
          aspect: transformedData.aspect,
          stars: transformedData.stars,
          score: transformedData.score,
          amt: transformedData.amt,
          unit: transformedData.unit,
          issuerId: userId,
          issuerIdType: 'URL',
          effectiveDate: transformedData.effectiveDate ? new Date(transformedData.effectiveDate) : new Date()
        }
      });
      
      // TODO: Store image associations in a separate table if needed
      // For now, we'll include them in the response but not persist the relationship
      
      // Trigger pipeline in the background
      PipelineTrigger.processClaim(newClaim.id).catch(console.error);
      
      // Transform response back to v3 format
      const v3Response = {
        claim: transformNewToV3(newClaim),
        claimData: {
          id: newClaim.id,
          claimId: newClaim.id,
          name: claimData.name || ''
        },
        claimImages: imageData.map((img, idx) => ({
          id: idx + 1,
          claimId: newClaim.id,
          url: img.url,
          digetedMultibase: img.digestMultibase, // Note: typo preserved for compatibility
          metadata: img.metadata,
          effectiveDate: img.effectiveDate,
          createdDate: new Date().toISOString(),
          owner: img.owner,
          signature: img.signature
        }))
      };
      
      res.status(201).json(v3Response);
    } catch (error) {
      console.error('Error creating claim with images (v3):', error);
      res.status(500).json({ error: 'Failed to create claim' });
    }
  }
];

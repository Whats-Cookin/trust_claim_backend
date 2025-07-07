import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';

/**
 * Verifies a token from the bookmarklet
 * @param token - The JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
function verifyVerificationToken(token: string): {
  userId: number;
  linkedinId: string;
  purpose: string;
  timestamp: number;
} | null {
  try {
    const decoded = jwt.verify(
      token,
      process.env.VERIFICATION_SECRET || 'verification-secret-key'
    ) as any;
    
    return {
      userId: decoded.userId,
      linkedinId: decoded.linkedinId,
      purpose: decoded.purpose,
      timestamp: decoded.timestamp
    };
  } catch (error) {
    return null;
  }
}

/**
 * Endpoint to receive LinkedIn age verification from bookmarklet
 * Creates an ACCOUNT_CREATED claim with the member since date
 */
export async function verifyLinkedInAge(req: Request, res: Response): Promise<Response | void> {
  try {
    const token = req.headers['x-verification-token'] as string;
    const { memberSince, year } = req.body;
    
    if (!token) {
      return res.status(401).json({ error: 'Verification token required' });
    }
    
    // Verify the token
    const tokenData = verifyVerificationToken(token);
    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Verify we have the required data
    if (!memberSince || !year) {
      return res.status(400).json({ error: 'Missing member since data' });
    }
    
    // Look up the user's LinkedIn vanity name from their claims
    // The linkedinId in the token is the internal ID, not the vanity name
    const userClaims = await prisma.claim.findMany({
      where: {
        issuerId: `user:${tokenData.userId}`,
        claim: 'HAS_ACCOUNT',
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Find the LinkedIn account claim
    const linkedinClaim = userClaims.find(c => c.object?.includes('linkedin:'));
    if (!linkedinClaim) {
      return res.status(400).json({ error: 'LinkedIn profile not verified yet. Please complete Step 1 first.' });
    }
    
    // Extract vanity name from the claim object (e.g., "linkedin:john-doe" -> "john-doe")
    const vanityMatch = linkedinClaim.object!.match(/linkedin:(.+)/);
    if (!vanityMatch) {
      return res.status(400).json({ error: 'Invalid LinkedIn account claim format' });
    }
    
    const vanityName = vanityMatch[1];
    const platformUri = `https://linkedin.com/in/${vanityName}`;
    
    // Check if claim already exists
    const existingClaim = await prisma.claim.findFirst({
      where: {
        subject: platformUri,
        claim: 'ACCOUNT_CREATED'
      }
    });
    
    if (existingClaim) {
      return res.json({ 
        success: true, 
        message: 'Account age already verified',
        claimId: existingClaim.id 
      });
    }
    
    // Create new claim
    const claim = await prisma.claim.create({
      data: {
        subject: platformUri,
        claim: 'ACCOUNT_CREATED',
        object: year.toString(),
        statement: memberSince,
        howKnown: 'WEB_DOCUMENT' as const,
        confidence: 0.9, // High confidence since from official LinkedIn page
        sourceURI: 'https://www.linkedin.com/mypreferences/d/manage-data-and-activity',
        issuerId: `user:${tokenData.userId}`,
        issuerIdType: 'URL' as const,
        effectiveDate: new Date().toISOString(),
        amt: parseFloat(year),
        unit: 'year'
      }
    });
    
    console.log(`[LinkedIn Age] Created ACCOUNT_CREATED claim for ${vanityName}: ${memberSince}`);
    
    return res.json({
      success: true,
      message: 'LinkedIn account age verified successfully',
      claimId: claim.id
    });
    
  } catch (error) {
    console.error('LinkedIn age verification error:', error);
    return res.status(500).json({ error: 'Failed to verify LinkedIn age' });
  }
}

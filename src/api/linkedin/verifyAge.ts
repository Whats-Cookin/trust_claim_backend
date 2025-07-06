import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';

/**
 * Generates a short-lived verification token for bookmarklet authentication
 * @param userId - The user's database ID
 * @param linkedinId - The LinkedIn profile ID 
 * @param purpose - What this token is for (e.g., 'linkedin-age-verification')
 * @returns Signed JWT token valid for 5 minutes
 */
export function generateVerificationToken(
  userId: number,
  linkedinId: string,
  purpose: string = 'linkedin-age-verification'
): string {
  const payload = {
    userId,
    linkedinId,
    purpose,
    timestamp: Date.now()
  };
  
  // Token expires in 1 hour
  return jwt.sign(
    payload,
    process.env.VERIFICATION_SECRET || 'verification-secret-key',
    { expiresIn: '1h' }
  );
}

/**
 * Verifies a token from the bookmarklet
 * @param token - The JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export function verifyVerificationToken(token: string): {
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
    const { memberSince, year, profileUrl, profileId } = req.body;
    
    if (!token) {
      return res.status(401).json({ error: 'Verification token required' });
    }
    
    // Verify the token
    const tokenData = verifyVerificationToken(token);
    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Verify this is for LinkedIn age verification
    if (tokenData.purpose !== 'linkedin-age-verification') {
      return res.status(400).json({ error: 'Invalid token purpose' });
    }
    
    // Verify the profile ID matches what we expect
    if (tokenData.linkedinId !== profileId) {
      return res.status(400).json({ error: 'Profile ID mismatch' });
    }
    
    // Verify we have the required data
    if (!memberSince || !year) {
      return res.status(400).json({ error: 'Missing member since data' });
    }
    
    // Create the ACCOUNT_CREATED claim
    const platformUri = `https://linkedin.com/in/${profileId}`;
    
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
    
    // Create new claim with lower confidence since it's from client-side scraping
    const claim = await prisma.claim.create({
      data: {
        subject: platformUri,
        claim: 'ACCOUNT_CREATED',
        object: year.toString(),
        statement: memberSince, // Full text like "Member since March 2018"
        howKnown: 'WEB_DOCUMENT' as const,
        confidence: 0.6, // Lower confidence, can be increased after human verification
        sourceURI: profileUrl,
        issuerId: `user:${tokenData.userId}`,
        issuerIdType: 'URL' as const,
        effectiveDate: new Date().toISOString(),
        
        // Store metadata for potential human review
        aspect: 'requires_human_verification',
        amt: parseFloat(year),
        unit: 'year'
      }
    });
    
    console.log(`[LinkedIn Age] Created ACCOUNT_CREATED claim for ${profileId}: ${memberSince}`);
    
    return res.json({
      success: true,
      message: 'LinkedIn account age verified successfully',
      claimId: claim.id,
      confidence: 0.6,
      requiresHumanVerification: true
    });
    
  } catch (error) {
    console.error('LinkedIn age verification error:', error);
    return res.status(500).json({ error: 'Failed to verify LinkedIn age' });
  }
}

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';

/**
 * Generates a short-lived verification token for bookmarklet authentication
 * @param userId - The user's database ID
 * @param linkedinId - The LinkedIn profile ID 
 * @param purpose - What this token is for (e.g., 'linkedin-age-verification')
 * @returns Signed JWT token valid for 1 hour
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
 * Generate a profile slug from a name
 */
function generateProfileSlug(name: string): string {
  const timestamp = Date.now().toString(36).slice(-4);
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${timestamp}`;
}

/**
 * Generate profile URL from slug
 */
function generateProfileUrl(slug: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://talent.linkedtrust.us';
  return `${baseUrl}/profile/${slug}`;
}

/**
 * Unified endpoint to verify LinkedIn profile ownership
 * Creates necessary claims: HAS_PROFILE_AT, HAS_ACCOUNT
 */
export async function verifyLinkedInProfile(req: Request, res: Response): Promise<Response | void> {
  try {
    const token = req.headers['x-verification-token'] as string;
    const { 
      profileUrl, 
      profileId,
      step,
      timestamp
    } = req.body;
    
    console.log('[LinkedIn Verify] Request:', { 
      profileUrl, 
      profileId, 
      hasToken: !!token
    });
    
    if (!token) {
      return res.status(401).json({ error: 'Verification token required' });
    }
    
    // Verify the token
    const tokenData = verifyVerificationToken(token);
    if (!tokenData) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Verify we have required data
    if (!profileUrl || !profileId) {
      return res.status(400).json({ error: 'Profile URL and ID required' });
    }
    
    // Extract vanity name from profile URL
    const vanityMatch = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/i);
    if (!vanityMatch) {
      return res.status(400).json({ error: 'Invalid LinkedIn profile URL' });
    }
    
    const vanityName = vanityMatch[1];
    const platformUri = `https://linkedin.com/in/${vanityName}`;
    
    console.log('[LinkedIn Verify] Extracted vanity name:', vanityName);
    
    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: tokenData.userId }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Start transaction for atomic operations
    const result = await prisma.$transaction(async (tx) => {
      // Create or get profile
      let profileUrl = '';
      const existingProfileClaim = await tx.claim.findFirst({
        where: {
          OR: [
            { subject: platformUri, claim: 'HAS_PROFILE_AT' },
            { subject: `mailto:${user.email}`, claim: 'HAS_PROFILE_AT' }
          ]
        }
      });

      if (existingProfileClaim && existingProfileClaim.object) {
        profileUrl = existingProfileClaim.object;
      } else {
        // Generate new profile
        const profileSlug = generateProfileSlug(user.name || vanityName);
        profileUrl = generateProfileUrl(profileSlug);

        // Create profile claim
        await tx.claim.create({
          data: {
            subject: platformUri,
            claim: 'HAS_PROFILE_AT',
            object: profileUrl,
            statement: 'TalentStamp profile URL',
            howKnown: 'INTEGRATION' as const,
            confidence: 1.0,
            issuerId: `user:${user.id}`,
            issuerIdType: 'URL' as const,
            effectiveDate: new Date().toISOString()
          }
        });
      }
      
      // Check if HAS_ACCOUNT claim already exists
      const existingAccountClaim = await tx.claim.findFirst({
        where: {
          subject: platformUri,
          claim: 'HAS_ACCOUNT',
          object: `linkedin:${vanityName}`
        }
      });
      
      if (!existingAccountClaim) {
        // Create HAS_ACCOUNT claim
        await tx.claim.create({
          data: {
            subject: platformUri,
            claim: 'HAS_ACCOUNT',
            object: `linkedin:${vanityName}`,
            statement: 'Verified LinkedIn account ownership',
            howKnown: 'VERIFIED_LOGIN' as const,
            confidence: 1.0,
            sourceURI: platformUri,
            issuerId: `user:${user.id}`,
            issuerIdType: 'URL' as const,
            effectiveDate: new Date().toISOString(),
          }
        });
        
        console.log('[LinkedIn Verify] Created HAS_ACCOUNT claim for', vanityName);
      }
      
      return {
        platformUri,
        profileUrl
      };
    });
    
    console.log('[LinkedIn Verify] Transaction completed successfully');
    
    return res.json({
      success: true,
      message: 'LinkedIn profile verified successfully',
      platformUri: result.platformUri,
      profileUrl: result.profileUrl
    });
    
  } catch (error) {
    console.error('[LinkedIn Verify] Error:', error);
    return res.status(500).json({ error: 'Failed to verify LinkedIn profile' });
  }
}

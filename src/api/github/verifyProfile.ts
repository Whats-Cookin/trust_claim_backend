import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma';

/**
 * Generate a random suffix for profile collisions
 */
function generateRandomSuffix(length: number = 4): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a profile slug from a name
 * @param name - The full name to slugify
 * @param userId - The user's database ID
 * @param prismaClient - Prisma client for database queries
 */
async function generateProfileSlug(
  name: string,
  userId: number,
  prismaClient: any
): Promise<string> {
  // VERIFIED: Convert full name to URL-safe slug
  // WARNING: Empty names could result in empty baseSlug
  const baseSlug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  
  // FIX: Handle empty or invalid names
  if (!baseSlug) {
    return `user-${userId}-${generateRandomSuffix()}`;
  }
  
  // Check if this slug is already used
  const existingClaim = await prismaClient.claim.findFirst({
    where: {
      claim: 'HAS_PROFILE_AT',
      object: {
        endsWith: `/${baseSlug}`
      }
    }
  });
  
  // If no existing claim, use the base slug
  if (!existingClaim) {
    return baseSlug;
  }
  
  // If it exists and belongs to this user, reuse it
  if (existingClaim.issuerId === `user:${userId}`) {
    // Extract just the slug from the full URL
    const urlParts = existingClaim.object?.split('/') || [];
    return urlParts[urlParts.length - 1] || baseSlug;
  }
  
  // Otherwise, add random suffix until we find an unused one
  let attempts = 0;
  while (attempts < 10) {
    const candidateSlug = `${baseSlug}-${generateRandomSuffix()}`;
    const existingWithSuffix = await prismaClient.claim.findFirst({
      where: {
        claim: 'HAS_PROFILE_AT',
        object: {
          endsWith: `/${candidateSlug}`
        }
      }
    });
    
    if (!existingWithSuffix) {
      return candidateSlug;
    }
    
    attempts++;
  }
  
  // Fallback to timestamp if we can't find a unique one
  return `${baseSlug}-${Date.now().toString(36).slice(-4)}`;
}

/**
 * Generate profile URL from slug and base URL
 */
function generateProfileUrl(slug: string, profileBaseUrl: string): string {
  // Remove trailing slash if present
  const baseUrl = profileBaseUrl.replace(/\/$/, '');
  return `${baseUrl}/profile/${slug}`;
}

/**
 * Endpoint to verify GitHub profile and create/get profile URL
 * Similar to LinkedIn's verifyProfile but for GitHub OAuth flow
 */
export async function verifyGitHubProfile(req: Request, res: Response): Promise<Response | void> {
  try {
    const { 
      username,
      userId,
      name,
      email,
      profileBaseUrl
    } = req.body;
    
    console.log('[GitHub Verify] Request:', { 
      username,
      userId,
      name,
      email: email ? 'provided' : 'not provided'
    });
    
    // Verify we have required data
    if (!username || !userId || !profileBaseUrl) {
      return res.status(400).json({ error: 'Username, userId, and profile base URL required' });
    }
    
    const platformUri = `https://github.com/${username}`;
    
    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) }
    });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Start transaction for atomic operations
    const result = await prisma.$transaction(async (tx) => {
      // Find ALL profiles this user has created
      const existingProfiles = await tx.claim.findMany({
        where: {
          issuerId: `user:${user.id}`,
          claim: 'HAS_PROFILE_AT'
        },
        orderBy: { createdAt: 'asc' } // Get the oldest/first profile
      });

      let profileUrl: string;
      let primarySubject: string | null = null;

      if (existingProfiles.length > 0) {
        // User already has a profile!
        const primaryProfile = existingProfiles[0];
        profileUrl = primaryProfile.object || '';
        primarySubject = primaryProfile.subject;
        
        console.log('[GitHub Verify] Found existing profile:', profileUrl, 'under subject:', primarySubject);
        
        // Create SAME_AS claims to link GitHub to existing profile
        // Check if SAME_AS already exists
        const existingSameAs = await tx.claim.findFirst({
          where: {
            subject: platformUri,
            claim: 'SAME_AS',
            object: primarySubject
          }
        });
        
        if (!existingSameAs && primarySubject !== platformUri) {
          await tx.claim.create({
            data: {
              subject: platformUri,
              claim: 'SAME_AS',
              object: primarySubject,
              statement: 'GitHub account linked to primary profile',
              howKnown: 'VERIFIED_LOGIN' as const,
              confidence: 1.0,
              issuerId: `user:${user.id}`,
              issuerIdType: 'URL' as const,
              effectiveDate: new Date().toISOString()
            }
          });
        }
        
        // Create reverse SAME_AS
        const existingReverseSameAs = await tx.claim.findFirst({
          where: {
            subject: primarySubject,
            claim: 'SAME_AS',
            object: platformUri
          }
        });
        
        if (!existingReverseSameAs && primarySubject !== platformUri) {
          await tx.claim.create({
            data: {
              subject: primarySubject,
              claim: 'SAME_AS',
              object: platformUri,
              statement: 'Primary profile linked to GitHub account',
              howKnown: 'VERIFIED_LOGIN' as const,
              confidence: 1.0,
              issuerId: `user:${user.id}`,
              issuerIdType: 'URL' as const,
              effectiveDate: new Date().toISOString()
            }
          });
        }
      } else {
        // First time creating profile
        const profileName = name || user.name || username;
        const profileSlug = await generateProfileSlug(profileName, user.id, tx);
        profileUrl = generateProfileUrl(profileSlug, profileBaseUrl);
        
        console.log('[GitHub Verify] Creating new profile:', profileUrl);

        // Create profile claim
        await tx.claim.create({
          data: {
            subject: platformUri,
            claim: 'HAS_PROFILE_AT',
            object: profileUrl,
            statement: 'Profile URL',
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
          object: `github:${username}`
        }
      });
      
      if (!existingAccountClaim) {
        // Create HAS_ACCOUNT claim
        await tx.claim.create({
          data: {
            subject: platformUri,
            claim: 'HAS_ACCOUNT',
            object: `github:${username}`,
            statement: 'Verified GitHub account',
            howKnown: 'VERIFIED_LOGIN' as const,
            confidence: 1.0,
            sourceURI: platformUri,
            issuerId: `user:${user.id}`,
            issuerIdType: 'URL' as const,
            effectiveDate: new Date().toISOString(),
          }
        });
        
        console.log('[GitHub Verify] Created HAS_ACCOUNT claim for', username);
      }
      
      return {
        platformUri,
        profileUrl,
        profileSlug: profileUrl.split('/').pop() || ''
      };
    });
    
    console.log('[GitHub Verify] Transaction completed successfully');
    
    return res.json({
      success: true,
      message: 'GitHub profile verified successfully',
      platformUri: result.platformUri,
      profileUrl: result.profileUrl,
      profileSlug: result.profileSlug
    });
    
  } catch (error) {
    console.error('[GitHub Verify] Error:', error);
    return res.status(500).json({ error: 'Failed to verify GitHub profile' });
  }
}

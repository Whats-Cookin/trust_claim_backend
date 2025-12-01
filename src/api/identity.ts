import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../lib/auth';
import { userIdToUri } from '../lib/validators';

/**
 * Relationship types that indicate identity equivalence.
 * These are used for transitive identity linking (e.g., "this GitHub is the same person as this DID").
 *
 * Supports both:
 * - Legacy: claim="SAME_AS"
 * - New: claim="RELATED_TO" with aspect="relationship:same-as"
 *
 * Future relationship types (e.g., "worked-for", "subsidiary-of") would use different aspects
 * and would NOT be included here since they don't imply identity equivalence.
 */
export const IDENTITY_EQUIVALENT_ASPECTS = ['relationship:same-as'] as const;

/**
 * Builds a Prisma where clause to find identity-equivalent claims.
 * This is the single source of truth for what constitutes an identity link.
 *
 * @param uriField - Which field to match the URI against ('subject' or 'object')
 * @param uri - The URI to search for
 * @returns Prisma where clause
 */
export function buildIdentityLinkWhereClause(uriField: 'subject' | 'object', uri: string) {
  const baseCondition = uriField === 'subject'
    ? { subject: uri, object: { not: null } }
    : { object: uri };

  return {
    ...baseCondition,
    OR: [
      // Legacy: direct SAME_AS claim type
      { claim: "SAME_AS" },
      // New: RELATED_TO with identity-equivalent aspect
      {
        claim: "RELATED_TO",
        aspect: { in: [...IDENTITY_EQUIVALENT_ASPECTS] }
      }
    ]
  };
}

/**
 * Helper function to find all linked subjects via identity-equivalent claims (transitive closure)
 * Performs bidirectional graph traversal to find all URIs connected via SAME_AS or equivalent relationships.
 *
 * Recognizes:
 * - claim="SAME_AS" (legacy)
 * - claim="RELATED_TO" with aspect="relationship:same-as" (new)
 */
export async function findLinkedSubjects(uri: string): Promise<Set<string>> {
  const linkedSubjects = new Set<string>();
  linkedSubjects.add(uri); // Start with the original URI

  const visited = new Set<string>();
  const toVisit = [uri];

  while (toVisit.length > 0) {
    const currentUri = toVisit.pop()!;
    if (visited.has(currentUri)) continue;
    visited.add(currentUri);

    // Find identity-equivalent claims where this URI is the subject
    const subjectClaims = await prisma.claim.findMany({
      where: buildIdentityLinkWhereClause('subject', currentUri),
      select: { object: true },
    });

    // Find identity-equivalent claims where this URI is the object
    const objectClaims = await prisma.claim.findMany({
      where: buildIdentityLinkWhereClause('object', currentUri),
      select: { subject: true },
    });

    // Add all found URIs to our set and to visit list
    for (const claim of subjectClaims) {
      if (claim.object && !visited.has(claim.object)) {
        linkedSubjects.add(claim.object);
        toVisit.push(claim.object);
      }
    }

    for (const claim of objectClaims) {
      if (!visited.has(claim.subject)) {
        linkedSubjects.add(claim.subject);
        toVisit.push(claim.subject);
      }
    }
  }

  return linkedSubjects;
}

/**
 * GET /api/identity/subjects?uri=X
 * Returns all subjects linked to the given URI via SAME_AS claims
 */
export async function getLinkedSubjects(req: Request, res: Response): Promise<Response> {
  console.log('=== GET /api/identity/subjects - Request received ===');
  console.log('Query params:', JSON.stringify(req.query, null, 2));
  console.log('=====================================================');

  try {
    const { uri } = req.query;

    if (!uri || typeof uri !== 'string') {
      console.error('Missing or invalid URI parameter');
      return res.status(400).json({
        success: false,
        error: 'Missing URI parameter',
        details: 'URI query parameter is required and must be a string'
      });
    }

    console.log('Finding linked subjects for URI:', uri);
    const linkedSubjects = await findLinkedSubjects(uri);
    const subjectsArray = Array.from(linkedSubjects);

    console.log(`Found ${subjectsArray.length} linked subjects (including original)`);

    return res.status(200).json({
      success: true,
      uri,
      subjects: subjectsArray,
      count: subjectsArray.length
    });
  } catch (error) {
    console.error('=== Error finding linked subjects ===');
    console.error('Error details:', error);
    console.error('=====================================');

    return res.status(500).json({
      success: false,
      error: 'Failed to find linked subjects',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * GET /api/identity/linked?uri1=X&uri2=Y
 * Checks if two URIs are connected via SAME_AS claims (transitive closure)
 */
export async function checkLinkedIdentities(req: Request, res: Response): Promise<Response> {
  console.log('=== GET /api/identity/linked - Request received ===');
  console.log('Query params:', JSON.stringify(req.query, null, 2));
  console.log('====================================================');

  try {
    const { uri1, uri2 } = req.query;

    if (!uri1 || typeof uri1 !== 'string' || !uri2 || typeof uri2 !== 'string') {
      console.error('Missing or invalid URI parameters');
      return res.status(400).json({
        success: false,
        error: 'Missing URI parameters',
        details: 'Both uri1 and uri2 query parameters are required and must be strings'
      });
    }

    console.log('Checking if URIs are linked:', { uri1, uri2 });

    // Find all subjects linked to uri1
    const linkedSubjects = await findLinkedSubjects(uri1);
    const linked = linkedSubjects.has(uri2);

    console.log(`URIs are ${linked ? 'LINKED' : 'NOT LINKED'}`);
    console.log(`Total subjects in linkage set: ${linkedSubjects.size}`);

    return res.status(200).json({
      success: true,
      linked,
      uri1,
      uri2,
      subjects: Array.from(linkedSubjects),
      message: linked
        ? `${uri1} and ${uri2} are connected via SAME_AS claims`
        : `${uri1} and ${uri2} are not connected`
    });
  } catch (error) {
    console.error('=== Error checking linked identities ===');
    console.error('Error details:', error);
    console.error('========================================');

    return res.status(500).json({
      success: false,
      error: 'Failed to check linked identities',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * GET /api/identity/is-me?subjectUri=X
 * Checks if the given subjectUri is linked to the logged-in user
 * Requires authentication
 */
export async function checkIsMe(req: AuthRequest, res: Response): Promise<Response> {
  console.log('=== GET /api/identity/is-me - Request received ===');
  console.log('Query params:', JSON.stringify(req.query, null, 2));
  console.log('User:', JSON.stringify(req.user, null, 2));
  console.log('==================================================');

  try {
    const { subjectUri } = req.query;

    if (!subjectUri || typeof subjectUri !== 'string') {
      console.error('Missing or invalid subjectUri parameter');
      return res.status(400).json({
        success: false,
        error: 'Missing subjectUri parameter',
        details: 'subjectUri query parameter is required and must be a string'
      });
    }

    if (!req.user?.id) {
      console.error('No authenticated user found');
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        details: 'This endpoint requires authentication'
      });
    }

    const userId = req.user.id;
    const userDid = req.user.did;  // DID for wallet-authenticated users
    console.log('Checking if subjectUri is linked to user:', { userId, userDid, subjectUri });

    // Convert user ID to URI format
    const userUri = userIdToUri(userId);
    if (!userUri) {
      console.error('Could not convert userId to URI:', userId);
      return res.status(500).json({
        success: false,
        error: 'Invalid user ID format',
        details: 'Could not convert user ID to URI format'
      });
    }

    console.log('User URI:', userUri);
    console.log('User DID:', userDid || 'none');

    // Find all subjects linked to the user's URI
    const userSubjects = await findLinkedSubjects(userUri);

    // If user has a DID, also find subjects linked to the DID
    // This handles wallet-authenticated users whose DID may have SAME_AS claims
    if (userDid) {
      const didSubjects = await findLinkedSubjects(userDid);
      didSubjects.forEach(s => userSubjects.add(s));
    }

    const isMe = userSubjects.has(subjectUri);

    console.log(`subjectUri ${isMe ? 'IS' : 'IS NOT'} linked to user`);
    console.log(`User has ${userSubjects.size} linked subjects`);

    return res.status(200).json({
      success: true,
      isMe,
      subjectUri,
      userUri,
      userSubjects: Array.from(userSubjects),
      message: isMe
        ? `${subjectUri} is linked to your account`
        : `${subjectUri} is not linked to your account`
    });
  } catch (error) {
    console.error('=== Error checking is-me ===');
    console.error('Error details:', error);
    console.error('============================');

    return res.status(500).json({
      success: false,
      error: 'Failed to check identity ownership',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
}

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../lib/auth';
import { userIdToUri } from '../lib/validators';

/**
 * Helper function to find all linked subjects via SAME_AS claims (transitive closure)
 * Performs bidirectional graph traversal to find all URIs connected via SAME_AS
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

    // Find SAME_AS claims where this URI is the subject
    const subjectClaims = await prisma.claim.findMany({
      where: {
        subject: currentUri,
        claim: "SAME_AS",
        object: { not: null },
      },
      select: { object: true },
    });

    // Find SAME_AS claims where this URI is the object
    const objectClaims = await prisma.claim.findMany({
      where: {
        object: currentUri,
        claim: "SAME_AS",
      },
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
    console.log('Checking if subjectUri is linked to user:', { userId, subjectUri });

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

    // Find all subjects linked to the user's URI
    const userSubjects = await findLinkedSubjects(userUri);
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

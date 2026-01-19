import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../lib/auth';
// import { PipelineTrigger } from '../services/pipelineTrigger'; // Unused - for future claim extraction
import crypto from 'crypto';

// Helper to generate hash for credential without ID
function generateCredentialHash(credential: any): string {
  const canonicalData = JSON.stringify({
    context: credential['@context'] || credential.context,
    type: credential.type,
    issuer: credential.issuer,
    credentialSubject: credential.credentialSubject,
    issuanceDate: credential.issuanceDate
  });
  return crypto.createHash('sha256').update(canonicalData).digest('hex');
}

// Helper to extract name from credential
function extractCredentialName(credential: any): string {
  // Try various common name fields
  if (credential.name) return credential.name;
  if (credential.credentialSubject?.name) return credential.credentialSubject.name;
  if (credential.credentialSubject?.achievement?.name) return credential.credentialSubject.achievement.name;
  if (credential.badge?.name) return credential.badge.name;
  
  // Fall back to type
  const types = Array.isArray(credential.type) ? credential.type : [credential.type];
  const meaningfulType = types.find((t: any) => t !== 'VerifiableCredential') || 'Credential';
  return meaningfulType;
}

// Helper to extract display hints based on credential type
function extractDisplayHints(_credential: any, schemaType: string): any {
  const hints: any = {
    primaryDisplay: 'name',
    secondaryDisplay: 'issuer',
    badgeType: 'credential'
  };
  
  // OpenBadges specific hints
  if (schemaType === 'OpenBadges') {
    hints.primaryDisplay = 'achievement.name';
    hints.imageField = 'achievement.image';
    hints.badgeType = 'achievement';
    hints.showSkills = true;
    hints.showCriteria = true;
  }
  
  // Blockcerts specific hints
  if (schemaType === 'Blockcerts') {
    hints.primaryDisplay = 'badge.name';
    hints.imageField = 'badge.image';
    hints.showBlockchainVerification = true;
  }
  
  return hints;
}

// Helper to detect credential schema/type
function detectCredentialSchema(credential: any): string {
  const context = credential['@context'] || credential.context;
  
  // Check for known schemas
  if (JSON.stringify(context).includes('openbadges')) return 'OpenBadges';
  if (JSON.stringify(context).includes('blockcerts')) return 'Blockcerts';
  if (JSON.stringify(context).includes('learningmachine')) return 'LearningMachine';
  
  // Check types
  const types = Array.isArray(credential.type) ? credential.type : [credential.type];
  if (types.includes('OpenBadgeCredential')) return 'OpenBadges';
  if (types.includes('BlockcertsCredential')) return 'Blockcerts';
  
  return 'VerifiableCredential';
}

// Submit a credential with optional schema and metadata
export async function submitCredential(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const { credential, schema, metadata, replace, replaceBySubject } = req.body;

    // Handle both old format (credential only) and new format
    const actualCredential = credential || req.body;
    const hasNewFormat = !!credential;
    
    // Determine canonical URI (use credential's own ID if it has one)
    const credentialUri = actualCredential.id || `urn:credential:${generateCredentialHash(actualCredential)}`;
    
    // Check if credential already exists
    const existing = await prisma.credential.findFirst({
      where: {
        OR: [
          { id: credentialUri },
          { canonicalUri: credentialUri }
        ]
      }
    });
    
    if (existing) {
      if (replace === true) {
        // Delete existing credential and its UriEntity, then proceed to create new
        console.log(`Replace flag set - deleting existing credential ${existing.id}`);
        await prisma.uriEntity.deleteMany({ where: { uri: existing.id } });
        await prisma.uriEntity.deleteMany({ where: { uri: existing.canonicalUri || '' } });
        await prisma.credential.delete({ where: { id: existing.id } });
        console.log(`Deleted existing credential, proceeding with new credential creation`);
      } else {
        // Credential exists - just return it with claim URL
        return res.json({
          credential: existing,
          uri: credentialUri,
          schema: existing.credentialSchema,
          claimUrl: `${process.env.FRONTEND_URL || 'https://linkedtrust.us'}/claim-credential?uri=${encodeURIComponent(credentialUri)}&schema=${encodeURIComponent(existing.credentialSchema || 'VerifiableCredential')}`,
          message: 'Credential already exists. Visit the claim URL to claim it.'
        });
      }
    }

    // Check for existing credential by subject (for talent app - one credential per person)
    if (replaceBySubject === true && actualCredential.credentialSubject?.id) {
      const subjectId = actualCredential.credentialSubject.id;
      console.log(`ReplaceBySubject flag set - checking for existing credentials for subject ${subjectId}`);

      // Find credentials with matching credentialSubject.id
      const existingBySubject = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Credential"
        WHERE "credentialSubject"->>'id' = ${subjectId}
      `;

      if (existingBySubject.length > 0) {
        console.log(`Found ${existingBySubject.length} existing credentials for subject, deleting...`);
        for (const cred of existingBySubject) {
          await prisma.uriEntity.deleteMany({ where: { uri: cred.id } });
          await prisma.credential.delete({ where: { id: cred.id } });
        }
        console.log(`Deleted ${existingBySubject.length} credentials for subject ${subjectId}`);
      }
    }
    
    // Determine schema - use provided schema or auto-detect
    let schemaIdentifier = detectCredentialSchema(actualCredential);
    let schemaMetadata = {};
    
    if (hasNewFormat && schema) {
      // If schema provided, use it
      if (typeof schema === 'string') {
        schemaIdentifier = schema;
      } else if (schema.id) {
        schemaIdentifier = schema.id;
        schemaMetadata = schema;
      }
    }
    
    // Merge any additional metadata
    const fullMetadata = {
      ...schemaMetadata,
      ...(metadata || {}),
      submittedAt: new Date().toISOString(),
      displayHints: metadata?.displayHints || extractDisplayHints(actualCredential, schemaIdentifier)
    };
    
    // Store credential with enhanced metadata
    const stored = await prisma.credential.create({
      data: {
        id: credentialUri,
        canonicalUri: credentialUri,
        name: extractCredentialName(actualCredential),
        credentialSchema: schemaIdentifier,
        context: actualCredential['@context'] || actualCredential.context,
        type: actualCredential.type,
        issuer: actualCredential.issuer,
        issuanceDate: actualCredential.issuanceDate ? new Date(actualCredential.issuanceDate) : null,
        expirationDate: actualCredential.expirationDate ? new Date(actualCredential.expirationDate) : null,
        credentialSubject: actualCredential.credentialSubject,
        proof: actualCredential.proof,
        // Store additional metadata in existing sameAs field (JSON type)
        sameAs: fullMetadata
      }
    });
    
    // Register as entity
    await prisma.uriEntity.create({
      data: {
        uri: credentialUri,
        entityType: 'CREDENTIAL',
        entityTable: 'Credential',
        entityId: credentialUri,
        name: stored.name || undefined
      }
    });
    
    // Return simple response with credential URI and claim URL
    res.json({ 
      credential: stored, 
      uri: credentialUri,
      schema: schemaIdentifier,
      metadata: fullMetadata,
      claimUrl: `${process.env.FRONTEND_URL || 'https://linkedtrust.us'}/claim-credential?uri=${encodeURIComponent(credentialUri)}&schema=${encodeURIComponent(schemaIdentifier)}`,
      instructions: {
        message: 'To claim this credential, visit the claim URL and create a HAS claim',
        claimEndpoint: '/api/claims',
        exampleClaim: {
          subject: 'your-user-uri',
          claim: 'HAS',
          object: credentialUri,
          statement: 'Your personalized statement about this achievement'
        }
      }
    });
  } catch (error) {
    console.error('Error submitting credential:', error);
    res.status(500).json({ error: 'Failed to submit credential' });
  }
}

// UNUSED: Extract claims from credential content
// This function is not currently used - we follow a user-driven flow where
// users create their own claims after being redirected to the claim page.
// Keeping this for potential future automation.
/*
async function _extractClaimsFromCredential(credential: any, userId: string) {
  const claims = [];
  const subjectUri = credential.credentialSubject?.id || getUserUri(userId);
  const credentialUri = credential.id || `urn:credential:${generateCredentialHash(credential)}`;
  
  // Extract achievement claims
  if (credential.credentialSubject?.achievement) {
    const achievement = credential.credentialSubject.achievement;
    
    // ACHIEVED claim
    const achievementClaim = await prisma.claim.create({
      data: {
        subject: subjectUri,
        claim: 'ACHIEVED',
        object: achievement.id || achievement.name,
        statement: achievement.description || `Achieved: ${achievement.name}`,
        issuerId: getUserUri(userId),
        issuerIdType: 'URL',
        sourceURI: credentialUri,
        howKnown: 'WEB_DOCUMENT',
        confidence: 1.0,
        effectiveDate: credential.issuanceDate ? new Date(credential.issuanceDate) : new Date()
      }
    });
    claims.push(achievementClaim);
  }
  
  // Extract skill claims
  if (credential.credentialSubject?.skills) {
    for (const skill of credential.credentialSubject.skills) {
      const skillClaim = await prisma.claim.create({
        data: {
          subject: subjectUri,
          claim: 'HAS_SKILL',
          object: skill.id || skill,
          statement: `Has skill: ${skill.name || skill}`,
          issuerId: getUserUri(userId),
          issuerIdType: 'URL',
          sourceURI: credentialUri,
          howKnown: 'WEB_DOCUMENT',
          confidence: 1.0,
          effectiveDate: new Date()
        }
      });
      claims.push(skillClaim);
    }
  }
  
  // Trigger pipeline for each extracted claim
  for (const claim of claims) {
    PipelineTrigger.processClaim(claim.id).catch(console.error);
  }
  
  return claims;
}
*/

// Query credentials with flexible filtering
export async function queryCredentials(req: Request, res: Response): Promise<Response | void> {
  try {
    const {
      type,           // Match if type array contains this value
      issuer,         // Match issuer.id or issuer contains
      schema,         // Exact match on credentialSchema
      issuedAfter,    // issuanceDate >= date
      issuedBefore,   // issuanceDate <= date
      name: nameQuery,// Partial match (ILIKE)
      subject,        // Match credentialSubject.id
      limit = '20',
      offset = '0',
      sort = 'recent' // 'recent', 'oldest', 'name'
    } = req.query;

    // Parse and validate pagination
    const limitNum = Math.min(Math.max(1, parseInt(limit as string) || 20), 100);
    const offsetNum = Math.max(0, parseInt(offset as string) || 0);

    // Build where conditions
    const whereConditions: any[] = [];

    // Type filter - check if JSONB array contains value
    if (type) {
      whereConditions.push({
        type: {
          array_contains: type as string
        }
      });
    }

    // Issuer filter - check issuer.id or issuer as string
    if (issuer) {
      whereConditions.push({
        OR: [
          { issuer: { path: ['id'], equals: issuer as string } },
          { issuer: { equals: issuer as string } }
        ]
      });
    }

    // Schema filter - exact match
    if (schema) {
      whereConditions.push({
        credentialSchema: schema as string
      });
    }

    // Date range filters
    if (issuedAfter) {
      whereConditions.push({
        issuanceDate: { gte: new Date(issuedAfter as string) }
      });
    }
    if (issuedBefore) {
      whereConditions.push({
        issuanceDate: { lte: new Date(issuedBefore as string) }
      });
    }

    // Name filter - partial match
    if (nameQuery) {
      whereConditions.push({
        name: { contains: nameQuery as string, mode: 'insensitive' }
      });
    }

    // Subject filter - match credentialSubject.id
    if (subject) {
      whereConditions.push({
        credentialSubject: { path: ['id'], equals: subject as string }
      });
    }

    // Build the where clause
    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Determine sort order
    let orderBy: any;
    switch (sort) {
      case 'oldest':
        orderBy = { issuanceDate: 'asc' };
        break;
      case 'name':
        orderBy = { name: 'asc' };
        break;
      case 'recent':
      default:
        orderBy = { issuanceDate: 'desc' };
        break;
    }

    // Execute query with count
    const [credentials, total] = await Promise.all([
      prisma.credential.findMany({
        where,
        orderBy,
        skip: offsetNum,
        take: limitNum
      }),
      prisma.credential.count({ where })
    ]);

    return res.json({
      credentials,
      total,
      limit: limitNum,
      offset: offsetNum,
      sort
    });
  } catch (error) {
    console.error('Error querying credentials:', error);
    return res.status(500).json({ error: 'Failed to query credentials' });
  }
}

// Get credential by URI
export async function getCredential(req: Request, res: Response): Promise<Response | void> {
  try {
    const { uri } = req.params;
    
    const credential = await prisma.credential.findFirst({
      where: {
        OR: [
          { id: uri },
          { canonicalUri: uri }
        ]
      }
    });
    
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found' });
    }
    
    // Get related claims
    const claims = await prisma.claim.findMany({
      where: {
        OR: [
          { object: credential.canonicalUri || credential.id },
          { sourceURI: credential.canonicalUri || credential.id }
        ]
      },
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true
          }
        }
      }
    });
    
    res.json({ credential, relatedClaims: claims });
  } catch (error) {
    console.error('Error fetching credential:', error);
    res.status(500).json({ error: 'Failed to fetch credential' });
  }
}

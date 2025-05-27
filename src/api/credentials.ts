import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, getUserUri } from '../lib/auth';
import { PipelineTrigger } from '../services/pipelineTrigger';
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
function extractDisplayHints(credential: any, schemaType: string): any {
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
    const { credential, schema, metadata } = req.body;
    const userId = req.user?.id;
    
    // Handle both old format (credential only) and new format
    const actualCredential = credential || req.body;
    const hasNewFormat = !!credential;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Determine canonical URI
    const canonicalUri = actualCredential.id || `urn:credential:${generateCredentialHash(actualCredential)}`;
    
    // Check if credential already exists
    const existing = await prisma.credential.findFirst({
      where: {
        OR: [
          { id: canonicalUri },
          { canonicalUri: canonicalUri }
        ]
      }
    });
    
    if (existing) {
      return res.status(409).json({ 
        error: 'Credential already exists',
        credential: existing 
      });
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
      submittedBy: userId,
      submittedAt: new Date().toISOString(),
      displayHints: metadata?.displayHints || extractDisplayHints(actualCredential, schemaIdentifier)
    };
    
    // Store credential with enhanced metadata
    const stored = await prisma.credential.create({
      data: {
        id: canonicalUri,
        canonicalUri: canonicalUri,
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
        uri: canonicalUri,
        entityType: 'CREDENTIAL',
        entityTable: 'Credential',
        entityId: canonicalUri,
        name: stored.name || undefined
      }
    });
    
    // Determine subject URI
    const subjectUri = actualCredential.credentialSubject?.id || getUserUri(userId);
    
    // Create HAS claim
    const claim = await prisma.claim.create({
      data: {
        subject: subjectUri,
        claim: 'HAS',
        object: canonicalUri,
        statement: `Has credential: ${stored.name}`,
        issuerId: getUserUri(userId),
        issuerIdType: 'URL',
        sourceURI: actualCredential.issuer?.id || actualCredential.issuer || canonicalUri,
        howKnown: 'VERIFIED_LOGIN',
        confidence: 1.0,
        effectiveDate: new Date()
      }
    });
    
    // Trigger pipeline
    PipelineTrigger.processClaim(claim.id).catch(console.error);
    
    // Extract additional claims from credential (if any)
    extractClaimsFromCredential(actualCredential, userId).catch(console.error);
    
    res.json({ 
      credential: stored, 
      claim,
      uri: canonicalUri,
      schema: schemaIdentifier,
      metadata: fullMetadata
    });
  } catch (error) {
    console.error('Error submitting credential:', error);
    res.status(500).json({ error: 'Failed to submit credential' });
  }
}

// Extract claims from credential content
async function extractClaimsFromCredential(credential: any, userId: string) {
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

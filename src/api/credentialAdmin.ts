import { Request, Response } from 'express';
import { AuthRequest } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// Admin endpoint to create a credential for assignment
export async function createCredentialForAssignment(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const { 
      recipientEmail,
      recipientName,
      achievementName,
      achievementDescription,
      skills,
      criteria,
      issuerName,
      validityPeriod = 365 // days
    } = req.body;

    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // TODO: Check if user is admin or has issuer privileges
    // For now, any authenticated user can create

    // Generate credential ID
    const credentialId = `urn:uuid:${uuidv4()}`;
    const issuanceDate = new Date().toISOString();
    const expirationDate = new Date(Date.now() + validityPeriod * 24 * 60 * 60 * 1000).toISOString();

    // Create the credential structure
    const credential = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://purl.imsglobal.org/spec/ob/v3p0/context.json'
      ],
      id: credentialId,
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      issuer: {
        id: `https://live.linkedtrust.us/users/${userId}`,
        name: issuerName || 'LinkedTrust User'
      },
      issuanceDate,
      expirationDate,
      credentialSubject: {
        id: recipientEmail ? `mailto:${recipientEmail}` : undefined,
        name: recipientName,
        achievement: {
          id: `urn:uuid:${uuidv4()}`,
          type: ['Achievement'],
          name: achievementName,
          description: achievementDescription,
          criteria: {
            narrative: criteria
          }
        },
        skills: skills || []
      }
    };

    // Store credential
    const stored = await prisma.credential.create({
      data: {
        id: credentialId,
        canonicalUri: credentialId,
        name: achievementName,
        credentialSchema: 'OpenBadges',
        context: credential['@context'],
        type: credential.type,
        issuer: credential.issuer,
        issuanceDate: new Date(issuanceDate),
        expirationDate: new Date(expirationDate),
        credentialSubject: credential.credentialSubject,
        proof: {}, // Would be added by signing service
        sameAs: {
          displayHints: {
            primaryDisplay: 'achievement.name',
            imageField: 'achievement.image',
            badgeType: 'achievement',
            showSkills: true,
            showCriteria: true
          },
          createdBy: userId,
          createdFor: recipientEmail,
          assignmentPending: true
        }
      }
    });

    // Register as entity
    await prisma.uriEntity.create({
      data: {
        uri: credentialId,
        entityType: 'CREDENTIAL',
        entityTable: 'Credential',
        entityId: credentialId,
        name: achievementName
      }
    });

    // Generate offer token
    const offerToken = crypto.randomBytes(32).toString('hex');
    
    // TODO: Store offer token with expiry
    // await storeOfferToken(offerToken, credentialId, recipientEmail);

    // Generate invitation link
    const inviteLink = `https://live.linkedtrust.us/credential/${encodeURIComponent(credentialId)}?invite_token=${offerToken}`;

    res.json({
      credential: stored,
      credentialUri: credentialId,
      inviteLink,
      offerToken,
      recipientEmail,
      message: recipientEmail 
        ? `Credential created. Send the invite link to ${recipientEmail}`
        : 'Credential created. Share the invite link with the recipient.'
    });
  } catch (error) {
    console.error('Error creating credential for assignment:', error);
    res.status(500).json({ error: 'Failed to create credential' });
  }
}

// Quick credential templates for common use cases
export async function getCredentialTemplates(req: Request, res: Response): Promise<Response | void> {
  const templates = [
    {
      id: 'skill-verification',
      name: 'Skill Verification',
      fields: {
        achievementName: 'Skill Proficiency',
        achievementDescription: 'Verified proficiency in specific skill',
        criteria: 'Demonstrated competence through practical application'
      }
    },
    {
      id: 'course-completion',
      name: 'Course Completion',
      fields: {
        achievementName: 'Course Certificate',
        achievementDescription: 'Successfully completed course requirements',
        criteria: 'Attended all sessions and passed assessments'
      }
    },
    {
      id: 'volunteer-recognition',
      name: 'Volunteer Recognition',
      fields: {
        achievementName: 'Volunteer Service',
        achievementDescription: 'Recognition for volunteer contributions',
        criteria: 'Completed volunteer hours and activities'
      }
    },
    {
      id: 'employee-achievement',
      name: 'Employee Achievement',
      fields: {
        achievementName: 'Performance Recognition',
        achievementDescription: 'Outstanding performance and contribution',
        criteria: 'Exceeded performance expectations'
      }
    }
  ];

  res.json({ templates });
}
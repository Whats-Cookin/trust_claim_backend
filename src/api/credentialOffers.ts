import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { signClaimWithServerKey } from '../lib/crypto';
import { EntityDetector } from '../services/entityDetector';
import { PipelineTrigger } from '../services/pipelineTrigger';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Subject must be a URI the recipient controls (profile URL, DID) or a mailto:
const SUBJECT_URI_PATTERN = /^(https?:\/\/|did:|mailto:)/;

async function findOfferByToken(token: string) {
  if (!token || token.length < 16 || token.length > 128) return null;
  return prisma.credentialOffer.findUnique({ where: { tokenHash: hashToken(token) } });
}

// GET /api/credential-offers/:token
// Public, non-consuming preview so the magic-link landing page can render the
// certificate before the recipient decides to claim it.
export async function getOffer(req: Request, res: Response): Promise<Response | void> {
  try {
    const offer = await findOfferByToken(req.params.token);
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    if (!offer.claimedAt && offer.expiresAt && offer.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Offer expired' });
    }

    const credential = await prisma.credential.findUnique({ where: { id: offer.credentialId } });
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found for offer' });
    }

    res.json({
      recipientName: offer.recipientName,
      claimed: !!offer.claimedAt,
      claimedAt: offer.claimedAt,
      subjectUri: offer.subjectUri,
      claimId: offer.claimId,
      expiresAt: offer.expiresAt,
      issuerOrgUri: offer.issuerOrgUri,
      credential
    });
  } catch (error) {
    console.error('Error fetching credential offer:', error);
    res.status(500).json({ error: 'Failed to fetch offer' });
  }
}

// POST /api/credential-offers/:token/claim
// Body: { subjectUri?: string } — the URI the recipient wants as credential
// subject (e.g. their LinkedIn profile URL). Falls back to mailto:recipientEmail.
// One-time use: consumes the offer and creates a server-signed HAS claim.
export async function claimOffer(req: Request, res: Response): Promise<Response | void> {
  try {
    const offer = await findOfferByToken(req.params.token);
    if (!offer) {
      return res.status(404).json({ error: 'Offer not found' });
    }
    if (offer.claimedAt) {
      return res.status(409).json({
        error: 'Offer already claimed',
        claimId: offer.claimId,
        subjectUri: offer.subjectUri
      });
    }
    if (offer.expiresAt && offer.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Offer expired' });
    }

    const requestedSubject = typeof req.body?.subjectUri === 'string' ? req.body.subjectUri.trim() : '';
    if (requestedSubject && !SUBJECT_URI_PATTERN.test(requestedSubject)) {
      return res.status(400).json({
        error: 'subjectUri must be an http(s) URL, did:, or mailto: URI'
      });
    }
    const subject =
      requestedSubject || (offer.recipientEmail ? `mailto:${offer.recipientEmail}` : '');
    if (!subject) {
      return res.status(400).json({ error: 'subjectUri is required for this offer' });
    }

    const credential = await prisma.credential.findUnique({ where: { id: offer.credentialId } });
    if (!credential) {
      return res.status(404).json({ error: 'Credential not found for offer' });
    }

    const issuerName = (credential.issuer as any)?.name || 'the issuer';
    const claimData = {
      subject,
      claim: 'HAS',
      object: credential.canonicalUri || credential.id,
      statement: `${offer.recipientName || subject} has been awarded: ${
        credential.name || 'a credential'
      } by ${issuerName}`,
      sourceURI: offer.issuerOrgUri || null,
      howKnown: 'FIRST_HAND' as const,
      confidence: 1.0,
      aspect: null,
      stars: null,
      score: null,
      amt: null,
      unit: null,
      issuerId: offer.issuerOrgUri || 'https://live.linkedtrust.us',
      issuerIdType: 'URL' as const,
      effectiveDate: credential.issuanceDate || new Date()
    };

    let proof: string | null = null;
    try {
      proof = await signClaimWithServerKey(claimData, 'api-token');
    } catch (error) {
      console.error('Warning: failed to sign offer claim with server key:', error);
    }

    const newClaim = await prisma.claim.create({ data: { ...claimData, proof } });

    // Consume the offer atomically against double-claims: the update only
    // succeeds for the row that is still unclaimed.
    const consumed = await prisma.credentialOffer.updateMany({
      where: { id: offer.id, claimedAt: null },
      data: { claimedAt: new Date(), subjectUri: subject, claimId: newClaim.id }
    });
    if (consumed.count === 0) {
      await prisma.claim.delete({ where: { id: newClaim.id } });
      const winner = await prisma.credentialOffer.findUnique({ where: { id: offer.id } });
      return res.status(409).json({
        error: 'Offer already claimed',
        claimId: winner?.claimId,
        subjectUri: winner?.subjectUri
      });
    }

    // Record the resolved subject on the credential metadata
    const sameAs = (credential.sameAs as any) || {};
    await prisma.credential.update({
      where: { id: credential.id },
      data: {
        sameAs: { ...sameAs, assignmentPending: false, claimedBy: subject, claimId: newClaim.id }
      }
    });

    await EntityDetector.processClaimEntities(newClaim, offer.recipientName);
    PipelineTrigger.processClaim(newClaim.id, 'PERSON').catch(console.error);

    res.json({
      success: true,
      claimId: newClaim.id,
      subject,
      credentialUri: credential.canonicalUri || credential.id
    });
  } catch (error) {
    console.error('Error claiming credential offer:', error);
    res.status(500).json({ error: 'Failed to claim offer' });
  }
}

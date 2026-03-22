/**
 * ATProto API endpoints
 *
 * Endpoints for querying ATProto-indexed claims and triggering backfills.
 * These supplement the existing claims API — they don't replace it.
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AtprotoIndexer } from '../services/atprotoIndexer';

const prisma = new PrismaClient();

/**
 * GET /api/atproto/claims?subject=URL
 *
 * Query claims indexed from ATProto, filtered by subject.
 * Returns claims where claimAddress starts with at://
 */
export async function getAtprotoClaims(req: Request, res: Response) {
  try {
    const { subject, issuer, limit: limitStr } = req.query;
    const limit = Math.min(parseInt(limitStr as string || '50', 10), 200);

    const where: any = {
      claimAddress: { startsWith: 'at://' }
    };

    if (subject && subject !== '*') {
      // Normalize: strip trailing slash for comparison
      const normalized = (subject as string).replace(/\/+$/, '');
      where.subject = normalized;
    }

    if (issuer) {
      where.issuerId = issuer as string;
    }

    const claims = await prisma.claim.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        edges: {
          include: {
            startNode: true,
            endNode: true,
          }
        }
      }
    });

    // Also fetch images for each claim
    const claimIds = claims.map(c => c.id);
    const images = await prisma.image.findMany({
      where: { claimId: { in: claimIds } }
    });

    const imagesByClaimId: Record<number, any[]> = {};
    for (const img of images) {
      if (!imagesByClaimId[img.claimId]) imagesByClaimId[img.claimId] = [];
      imagesByClaimId[img.claimId].push(img);
    }

    const result = claims.map(c => ({
      ...c,
      images: imagesByClaimId[c.id] || [],
      _source: 'atproto',
    }));

    res.json({ claims: result, count: result.length });
  } catch (err: any) {
    console.error('ATProto claims query error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}

/**
 * GET /api/atproto/check?claimAddress=at://...
 *
 * Check if a specific AT-URI claim is already in our DB.
 */
export async function checkAtprotoClaim(req: Request, res: Response): Promise<void> {
  try {
    const { claimAddress } = req.query;
    if (!claimAddress) {
      res.status(400).json({ error: 'claimAddress query parameter required' });
      return;
    }

    const claim = await prisma.claim.findFirst({
      where: { claimAddress: claimAddress as string },
      select: { id: true, claimAddress: true, subject: true, claim: true }
    });

    res.json({ exists: !!claim, claim: claim || null });
  } catch (err: any) {
    console.error('ATProto check error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}

/**
 * POST /api/atproto/backfill
 *
 * Trigger a backfill of a specific ATProto repo.
 * Body: { repo: "did:plc:xyz" }
 */
export async function triggerBackfill(req: Request, res: Response): Promise<void> {
  try {
    const { repo } = req.body;
    if (!repo) {
      res.status(400).json({ error: 'repo (DID) required in body' });
      return;
    }

    const imported = await AtprotoIndexer.backfill(repo);
    res.json({ success: true, repo, imported });
  } catch (err: any) {
    console.error('ATProto backfill error:', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
}

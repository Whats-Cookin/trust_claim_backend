import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { userIdToUri } from '../lib/validators';
import { AuthRequest } from '../lib/auth';

// GET /api/my/claims — everything this signed-in user has issued, newest first.
// Backs the "your recommendations" view, where they can also delete.
export async function getMyClaims(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const issuerUri = userIdToUri(req.user?.id);
    if (!issuerUri) return res.status(401).json({ error: 'Not signed in' });

    const take = Math.min(Number(req.query.limit) || 50, 200);
    const claims = await prisma.claim.findMany({
      where: { issuerId: issuerUri },
      orderBy: { id: 'desc' },
      take
    });

    const ids = claims.map(c => c.id);
    const media = ids.length
      ? await prisma.image.findMany({ where: { claimId: { in: ids } } })
      : [];

    const withMedia = claims.map(c => {
      const mine = media.filter(m => m.claimId === c.id);
      const video = mine.find(m => {
        const meta = (m.metadata || {}) as any;
        return meta.type === 'video' || String(meta.contentType || '').startsWith('video/');
      });
      return { ...c, videoUrl: video?.url || null };
    });

    return res.json({ claims: withMedia });
  } catch (error) {
    console.error('Error listing own claims:', error);
    return res.status(500).json({ error: 'Failed to load your claims' });
  }
}

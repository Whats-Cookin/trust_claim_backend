import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { getVerifiedClient } from '../lib/clientAuth';

// Unambiguous alphabet: no 0/O/1/l/I, so a token survives being read aloud or
// retyped from a screenshot.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
const TOKEN_LENGTH = 7;

// An invite is a write capability for whoever holds the link. Ninety days is
// long enough for a link that sits unread in an inbox over a holiday, short
// enough that a forwarded link does not stay live for years.
const INVITE_TTL_DAYS = 90;

// A response is bound to its invite only if the claim was written within this
// window of the call. Long enough for a slow video upload, short enough that an
// old claim by someone else cannot be adopted.
const RESPONSE_BINDING_WINDOW_MS = 60 * 60 * 1000;

function makeToken(): string {
  const bytes = crypto.randomBytes(TOKEN_LENGTH);
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const SITE = process.env.PUBLIC_BASE_URL || 'https://live.linkedtrust.us';

function publicView(r: any) {
  return {
    subjectUri: r.subjectUri,
    subjectName: r.subjectName,
    recipientName: r.recipientName,
    recipientProfile: r.recipientProfile,
    aspect: r.aspect,
    workSummary: r.workSummary,
    suggestions: r.suggestions,
    note: r.note,
    requesterName: r.requesterName,
    responded: !!r.respondedAt,
    claimId: r.claimId
  };
}

// POST /api/testimonial-requests — create an invite, return the short link.
export async function createRequest(req: Request, res: Response): Promise<any> {
  try {
    const userId = Number.isFinite(Number((req as any).user?.id)) ? Number((req as any).user.id) : null;
    // A partner site (act, workers.vc) creates invites from its own page with
    // its client key, so the volunteer never leaves that page to sign in here.
    const client = userId ? null : await getVerifiedClient(req);
    if (userId === null && !client) {
      return res.status(401).json({ error: 'Sign in, or send client credentials' });
    }

    const {
      subjectUri,
      subjectName,
      recipientName,
      recipientProfile,
      aspect,
      workSummary,
      suggestions,
      note,
      requesterName
    } = req.body || {};

    if (!subjectUri || typeof subjectUri !== 'string') {
      return res.status(400).json({ error: 'subjectUri is required' });
    }

    // Retry on the vanishingly rare token collision rather than failing the call.
    for (let attempt = 0; attempt < 5; attempt++) {
      const token = makeToken();
      try {
        const created = await prisma.testimonialRequest.create({
          data: {
            tokenHash: hashToken(token),
            subjectUri: subjectUri.trim(),
            subjectName: subjectName?.trim() || null,
            recipientName: recipientName?.trim() || null,
            recipientProfile: recipientProfile?.trim() || null,
            aspect: aspect || null,
            workSummary: workSummary?.trim() || null,
            suggestions: suggestions?.trim() || null,
            note: note?.trim() || null,
            requesterName: requesterName?.trim() || null,
            requesterUri: client?.issuerUri || null,
            createdById: userId,
            expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
          }
        });
        return res.json({ token, url: `${SITE}/t/${token}`, id: created.id });
      } catch (e: any) {
        if (e?.code !== 'P2002') throw e;
      }
    }
    return res.status(500).json({ error: 'Could not allocate a link, please retry' });
  } catch (error) {
    console.error('Error creating testimonial request:', error);
    res.status(500).json({ error: 'Failed to create request' });
  }
}

// GET /api/testimonial-requests/:token — public, non-consuming.
export async function getRequest(req: Request, res: Response): Promise<any> {
  try {
    const token = req.params.token || '';
    if (token.length < 4 || token.length > 64) return res.status(404).json({ error: 'Not found' });

    const found = await prisma.testimonialRequest.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!found) return res.status(404).json({ error: 'Not found' });
    if (found.expiresAt && found.expiresAt < new Date()) return res.status(410).json({ error: 'Expired' });

    res.json(publicView(found));
  } catch (error) {
    console.error('Error fetching testimonial request:', error);
    res.status(500).json({ error: 'Failed to fetch request' });
  }
}

// POST /api/testimonial-requests/:token/responded — records which claim came back.
// The link keeps working afterwards; someone reopening it should see what they
// wrote, not a dead end.
export async function markResponded(req: Request, res: Response): Promise<any> {
  try {
    const token = req.params.token || '';
    const claimId = Number(req.body?.claimId);
    if (!claimId) return res.status(400).json({ error: 'claimId is required' });

    const found = await prisma.testimonialRequest.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!found) return res.status(404).json({ error: 'Not found' });

    // Holding the link lets you answer it; it must not let you pin someone
    // else's words to this invite. The claim has to be about what was asked
    // about, and it has to have just been written.
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      select: { subject: true, createdAt: true }
    });
    if (!claim || claim.subject !== found.subjectUri) {
      return res.status(400).json({ error: 'That claim is not a response to this request' });
    }
    if (Date.now() - new Date(claim.createdAt).getTime() > RESPONSE_BINDING_WINDOW_MS) {
      return res.status(400).json({ error: 'That claim is not a response to this request' });
    }

    const takenBy = await prisma.testimonialRequest.findFirst({
      where: { claimId, NOT: { id: found.id } },
      select: { id: true }
    });
    if (takenBy) return res.status(409).json({ error: 'That claim already answers another request' });

    await prisma.testimonialRequest.update({
      where: { id: found.id },
      data: { claimId, respondedAt: found.respondedAt ?? new Date() }
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Error marking testimonial request responded:', error);
    res.status(500).json({ error: 'Failed to update request' });
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The shell changes on every frontend deploy, so key the cache on the file's
// mtime rather than holding the first copy read at boot.
let cachedShell: { mtimeMs: number; html: string } | null = null;

function shellPath(): string | null {
  const candidates = [
    process.env.FRONTEND_DIST && path.join(process.env.FRONTEND_DIST, 'index.html'),
    '/var/www/trust_claim/index.html'
  ].filter(Boolean) as string[];
  for (const file of candidates) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function spaShell(): string | null {
  const file = shellPath();
  if (!file) return null;
  try {
    const { mtimeMs } = fs.statSync(file);
    if (cachedShell && cachedShell.mtimeMs === mtimeMs) return cachedShell.html;
    const html = fs.readFileSync(file, 'utf8');
    cachedShell = { mtimeMs, html };
    return html;
  } catch {
    return cachedShell?.html ?? null;
  }
}

// GET /t/:token — serves the app shell with this invite's preview tags baked in.
// Chat apps render the card from the raw HTML and never run the SPA, so the
// invite has to be in the markup or the preview falls back to a bare app title.
export async function renderInvitePage(req: Request, res: Response): Promise<any> {
  const shell = spaShell();
  if (!shell) return res.status(500).send('App is not built');

  let title = 'A request for a few words';
  let description = 'Someone would like your testimonial.';
  let preload = 'null';

  try {
    const token = req.params.token || '';
    const found =
      token.length >= 4 && token.length <= 64
        ? await prisma.testimonialRequest.findUnique({ where: { tokenHash: hashToken(token) } })
        : null;

    // An expired invite must not render a working form: the page preloads this
    // payload and skips the fetch that would otherwise surface the 410.
    if (found && found.expiresAt && found.expiresAt < new Date()) {
      title = 'This link has expired';
      description = 'Ask whoever sent it for a new one.';
      preload = JSON.stringify({ expired: true });
    } else if (found) {
      const who = found.requesterName?.trim();

      title = found.subjectName?.trim()
        ? `Review requested for ${found.subjectName.trim()}`
        : 'A request for a few words';
      description = found.workSummary?.trim()
        ? `About ${found.workSummary.trim()}. Takes a minute.`
        : who
        ? `${who} would like a few words. Takes a minute.`
        : 'It takes about a minute.';
      preload = JSON.stringify(publicView(found)).replace(/</g, '\\u003c');
    }
  } catch (error) {
    console.error('Error rendering invite page:', error);
  }

  const head = `
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${SITE}${escapeHtml(req.originalUrl)}" />
    <meta property="og:image" content="${SITE}/og-testimonial.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="LinkedTrust" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE}/og-testimonial.png" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="description" content="${escapeHtml(description)}" />
    <script>window.__TESTIMONIAL_INVITE__ = ${preload};</script>
  `;

  const html = shell
    .replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    .replace('</head>', `${head}</head>`);

  // Every other page of this SPA is served by nginx with no CSP. This route
  // returns the same app from Express, so helmet's API-oriented policy would
  // otherwise block its fonts, Google sign-in and recorded video.
  res.removeHeader('Content-Security-Policy');
  res.set('Cache-Control', 'no-store');
  res.type('html').send(html);
}

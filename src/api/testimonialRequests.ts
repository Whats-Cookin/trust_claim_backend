import { Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
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

// The mark from src/api/badge/image.ts, so the card and the badge look related.
const LOGO_PATH = 'M79.78,391.27c23.36,18,53.18,32.8,81.7,32.38,47-.7,42.88-46,42.3-50.82-26.4-101.56-93.35-130-93.35-130,50,18.26,80.58,57.34,99.3,99.13-1-124.16-72.68-169.32-72.68-169.32,40.22,22.54,63.56,58.14,76.75,96l7.39-147.87,7.39,147.86c13.19-37.86,36.53-73.46,76.75-96,0,0-71.69,45.16-72.68,169.32,18.71-41.79,49.3-80.87,99.3-99.13,0,0-67,28.46-93.35,130-.58,4.81-4.71,50.12,42.3,50.82,28.52.42,58.35-14.39,81.71-32.39A220.7,220.7,0,0,0,442.38,221.2C442.38,99,343.35,0,221.19,0S0,99,0,221.2A220.7,220.7,0,0,0,79.78,391.27Z';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(text: string, charsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > charsPerLine && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) return lines;
    } else {
      line = test;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

// GET /t/:token/preview.png — the card a chat app shows before anyone taps.
// A generic logo on an unfamiliar domain reads as review spam; the one thing
// that makes this look like what it is, is the name of the person asking.
export async function renderInvitePreview(req: Request, res: Response): Promise<any> {
  const W = 1200;
  const H = 630;

  let asker = '';
  let about = '';
  try {
    const token = req.params.token || '';
    const found =
      token.length >= 4 && token.length <= 64
        ? await prisma.testimonialRequest.findUnique({ where: { tokenHash: hashToken(token) } })
        : null;
    if (found) {
      asker = found.requesterName?.trim() || '';
      about = found.subjectName?.trim() || found.subjectUri.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    }
  } catch (error) {
    console.error('Error rendering invite preview:', error);
  }

  const headline = asker
    ? `${asker} is asking you for a few words`
    : 'Someone is asking you for a few words';
  const lines = wrap(headline, 30, 3);
  const sans = '-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#F5F7FA"/>
  <rect x="0" y="0" width="${W}" height="10" fill="#00b2e5"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="90" y="${210 + i * 78}" font-family="${sans}" font-size="64" font-weight="600" fill="#1B2430">${escapeXml(line)}</text>`
    )
    .join('\n  ')}
  ${about ? `<text x="90" y="${232 + lines.length * 78}" font-family="${sans}" font-size="34" fill="#6B7684">about ${escapeXml(about.length > 48 ? about.slice(0, 47) + '…' : about)}</text>` : ''}
  <text x="90" y="${H - 72}" font-family="${sans}" font-size="28" fill="#6B7684">Takes a minute. No account needed.</text>
  <g transform="translate(${W - 150}, ${H - 112}) scale(0.13)">
    <ellipse cx="221.19" cy="221.65" rx="220.57" ry="215.85" fill="#fff"/>
    <path d="${LOGO_PATH}" fill="#3f2534"/>
  </g>
  <text x="${W - 152}" y="${H - 42}" font-family="${sans}" font-size="22" fill="#6B7684">LinkedTrust</text>
</svg>`;

  try {
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    res.setHeader('Content-Type', 'image/png');
    // Chat apps cache the card themselves; a day is plenty and keeps a corrected
    // name from being stuck for a week.
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(png);
  } catch (error) {
    console.error('Error rendering invite preview:', error);
    res.redirect(302, `${SITE}/og-testimonial.png`);
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
      const about = found.subjectName?.trim() || found.subjectUri.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

      // "Review requested for X" is the shape of the review spam everyone
      // already deletes. Who is asking is the only reason to open this.
      title = who ? `${who} is asking you for a few words` : 'Someone is asking you for a few words';
      description = found.workSummary?.trim()
        ? `About ${about} — ${found.workSummary.trim()}. Takes a minute, no account needed.`
        : `About ${about}. Takes a minute, no account needed.`;
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
    <meta property="og:image" content="${SITE}/t/${encodeURIComponent(req.params.token || '')}/preview.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:site_name" content="LinkedTrust" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE}/t/${encodeURIComponent(req.params.token || '')}/preview.png" />
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

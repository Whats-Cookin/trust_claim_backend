import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import { prisma } from '../../lib/prisma';

const execFileAsync = promisify(execFile);

const CACHE_DIR = path.join(process.cwd(), 'badge-cache');
const BASE_URL = process.env.BACKEND_BASE_URL || 'https://live.linkedtrust.us';

// LinkedTrust logo mark path data (extracted from badge.js)
const LOGO_PATH = 'M79.78,391.27c23.36,18,53.18,32.8,81.7,32.38,47-.7,42.88-46,42.3-50.82-26.4-101.56-93.35-130-93.35-130,50,18.26,80.58,57.34,99.3,99.13-1-124.16-72.68-169.32-72.68-169.32,40.22,22.54,63.56,58.14,76.75,96l7.39-147.87,7.39,147.86c13.19-37.86,36.53-73.46,76.75-96,0,0-71.69,45.16-72.68,169.32,18.71-41.79,49.3-80.87,99.3-99.13,0,0-67,28.46-93.35,130-.58,4.81-4.71,50.12,42.3,50.82,28.52.42,58.35-14.39,81.71-32.39A220.7,220.7,0,0,0,442.38,221.2C442.38,99,343.35,0,221.19,0S0,99,0,221.2A220.7,220.7,0,0,0,79.78,391.27Z';

function escapeXml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str: string, max: number): string {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function starsPath(stars: number): string {
  const full = Math.floor(stars);
  const half = stars - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  const star = '★';
  return (
    `<tspan fill="#FFC107">${star.repeat(full)}</tspan>` +
    (half ? `<tspan fill="#FFC107" opacity="0.5">${star}</tspan>` : '') +
    `<tspan fill="#ccc">${star.repeat(empty)}</tspan>` +
    ` <tspan fill="#888" font-style="normal" font-size="11">${Number(stars).toFixed(1)}</tspan>`
  );
}

function friendlySource(uri: string): string {
  try {
    const u = new URL(uri);
    const s = u.hostname + u.pathname;
    return s.length > 40 ? s.slice(0, 37) + '…' : s;
  } catch {
    return uri.slice(0, 40);
  }
}

/** Fetch an image from a URL and return as buffer */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const fullUrl = url.startsWith('/') ? BASE_URL + url : url;
    const res = await fetch(fullUrl);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Extract first frame from a video URL using ffmpeg */
async function extractVideoFrame(videoUrl: string): Promise<Buffer | null> {
  try {
    const fullUrl = videoUrl.startsWith('/') ? BASE_URL + videoUrl : videoUrl;
    const tmpOut = path.join(CACHE_DIR, `frame_${Date.now()}.png`);
    await execFileAsync('ffmpeg', [
      '-i', fullUrl,
      '-ss', '00:00:01',
      '-vframes', '1',
      '-f', 'image2',
      tmpOut,
      '-y'
    ]);
    const buf = fs.readFileSync(tmpOut);
    fs.unlinkSync(tmpOut);
    return buf;
  } catch (err) {
    console.error('ffmpeg frame extraction failed:', err);
    return null;
  }
}

/** Build the SVG card and composite with optional media thumbnail */
async function generateBadgePng(claim: any, images: any[]): Promise<Buffer> {
  const W = 600;
  const H = 180;
  const THUMB = 140; // thumbnail width/height
  const PAD = 20;

  // Determine media
  const videoEntry = images.find(i =>
    i.type === 'video' ||
    (i.contentType && i.contentType.startsWith('video/')) ||
    (i.url && /\.(mp4|webm|ogg)/.test(i.url))
  );
  const imageEntry = images.find(i =>
    i.type === 'image' ||
    (i.contentType && i.contentType.startsWith('image/'))
  );

  let mediaBuffer: Buffer | null = null;
  if (videoEntry) {
    mediaBuffer = await extractVideoFrame(videoEntry.url);
  } else if (imageEntry) {
    mediaBuffer = await fetchImageBuffer(imageEntry.url);
  }

  // Layout: if media present, text starts after thumbnail
  const textX = mediaBuffer ? PAD + THUMB + PAD : PAD;
  const textW = W - textX - PAD;

  // Build text lines
  const isRated = claim.claim?.toLowerCase() === 'rated' && claim.stars != null && claim.stars > 0;
  const statement = truncate(claim.statement || '', 120);
  const date = claim.effectiveDate
    ? new Date(claim.effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const sourceDisplay = claim.sourceURI ? friendlySource(claim.sourceURI) : '';

  // Text Y positions
  let y = PAD + 18;
  const starsY = y;
  if (isRated) y += 22;
  const statY = y;
  const statLines = splitText(statement, textW, 14);
  y += statLines.length * 20 + (statLines.length ? 8 : 0);
  const srcY = y;

  // SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <clipPath id="card"><rect width="${W}" height="${H}" rx="12" ry="12"/></clipPath>
    <clipPath id="thumb"><rect x="${PAD}" y="${PAD}" width="${THUMB}" height="${THUMB}" rx="6" ry="6"/></clipPath>
  </defs>

  <!-- Card background -->
  <rect width="${W}" height="${H}" rx="12" ry="12" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>

  <!-- Thumbnail placeholder (composited later if media exists) -->
  ${mediaBuffer ? `<rect x="${PAD}" y="${PAD}" width="${THUMB}" height="${THUMB}" rx="6" fill="#f1f5f9"/>` : ''}

  <!-- Stars -->
  ${isRated ? `<text x="${textX}" y="${starsY}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="16">${starsPath(claim.stars)}</text>` : ''}

  <!-- Statement -->
  ${statLines.map((line, i) =>
    `<text x="${textX}" y="${statY + i * 20}" font-family="Georgia,serif" font-size="14" font-style="italic" fill="#1a1a1a">${escapeXml(line)}</text>`
  ).join('\n  ')}

  <!-- Source + date -->
  <text x="${textX}" y="${srcY}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="12" fill="#64748b">
    ${sourceDisplay ? `<tspan>${escapeXml(sourceDisplay)}</tspan>` : ''}
    ${date ? `<tspan dx="${sourceDisplay ? 8 : 0}" fill="#94a3b8">${escapeXml(date)}</tspan>` : ''}
  </text>

  <!-- LinkedTrust verified mark (bottom right) -->
  <g transform="translate(${W - 80}, ${H - 22}) scale(0.032)">
    <ellipse cx="221.19" cy="221.65" rx="220.57" ry="215.85" fill="#fff"/>
    <path d="${LOGO_PATH}" fill="#3f2534"/>
  </g>
  <text x="${W - 62}" y="${H - 10}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="11" fill="#64748b">LinkedTrust</text>
</svg>`;

  // Convert SVG to PNG
  let img = sharp(Buffer.from(svg)).png();

  // Composite thumbnail
  if (mediaBuffer) {
    const thumb = await sharp(mediaBuffer)
      .resize(THUMB, THUMB, { fit: 'cover' })
      .png()
      .toBuffer();

    const base = await img.toBuffer();
    img = sharp(base).composite([{ input: thumb, left: PAD, top: PAD }]);
  }

  return img.png().toBuffer();
}

/** Naive word-wrap for SVG: split text into lines fitting maxWidth at fontSize */
function splitText(text: string, maxWidth: number, fontSize: number): string[] {
  if (!text) return [];
  // Approximate: average char width ~0.55 * fontSize for serif italic
  const charsPerLine = Math.floor(maxWidth / (fontSize * 0.55));
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (test.length > charsPerLine && current) {
      lines.push(current);
      current = word;
      if (lines.length >= 3) break; // max 3 lines
    } else {
      current = test;
    }
  }
  if (current && lines.length < 3) lines.push(current);
  return lines;
}

export async function getBadgeImage(req: Request, res: Response): Promise<void> {
  const rawId = req.params.claimId.replace(/\.png$/, '');
  const claimId = parseInt(rawId, 10);

  if (isNaN(claimId)) {
    res.status(400).json({ error: 'Invalid claim ID' });
    return;
  }

  // Check disk cache first
  const cachePath = path.join(CACHE_DIR, `${claimId}.png`);
  if (fs.existsSync(cachePath)) {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(cachePath);
    return;
  }

  try {
    const claim = await (prisma as any).claim.findUnique({
      where: { id: claimId }
    });

    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    const images = await (prisma as any).image.findMany({
      where: { claimId }
    });

    const pngBuffer = await generateBadgePng(claim, images || []);

    // Save to cache
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, pngBuffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(pngBuffer);
  } catch (err) {
    console.error('Badge image generation failed:', err);
    res.status(500).json({ error: 'Failed to generate badge image' });
  }
}

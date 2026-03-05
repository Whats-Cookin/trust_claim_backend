import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { Resvg } from '@resvg/resvg-js';

const prisma = new PrismaClient();

// Cache generated images for 1 hour
const imageCache = new Map<number, { png: Buffer; generatedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len - 1) + '\u2026';
}

// Wrap text into lines that fit within a given character width
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 > maxChars) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

interface ClaimData {
  id: number;
  statement: string | null;
  claim: string;
  subject: string;
  stars: number | null;
  aspect: string | null;
  issuerId: string | null;
  effectiveDate: Date | null;
  subjectName: string;
  issuerName: string;
  hasVideo: boolean;
}

async function getClaimData(claimId: number): Promise<ClaimData | null> {
  const claim = await prisma.claim.findUnique({
    where: { id: claimId },
    include: {
      edges: {
        include: {
          startNode: true,
          endNode: true,
        },
      },
    },
  });

  if (!claim) return null;

  // Get names from edges
  let subjectName = '';
  let issuerName = '';

  for (const edge of claim.edges) {
    if (edge.label === 'subject' && edge.endNode) {
      subjectName = edge.endNode.name || '';
    }
    if (edge.label === 'source' && edge.endNode) {
      issuerName = edge.endNode.name || '';
    }
  }

  // Check for video
  const images = await prisma.image.findMany({
    where: { claimId: claim.id },
  });

  const hasVideo = images.some(img => {
    const meta = img.metadata as any;
    return meta?.type === 'video' ||
      (img.url && /\.(webm|mp4|ogg|mov)$/i.test(img.url));
  });

  return {
    id: claim.id,
    statement: claim.statement,
    claim: claim.claim,
    subject: claim.subject,
    stars: claim.stars,
    aspect: claim.aspect,
    issuerId: claim.issuerId,
    effectiveDate: claim.effectiveDate,
    subjectName: subjectName || claim.subject,
    issuerName: issuerName || claim.issuerId || 'Someone',
    hasVideo,
  };
}

function buildOgImageSvg(data: ClaimData): string {
  const { subjectName, issuerName, statement, claim, stars, hasVideo } = data;

  // LinkedIn optimal: 1200x627
  const width = 1200;
  const height = 627;

  // Claim type label
  const claimLabel = claim === 'validated' ? 'Endorsed'
    : claim === 'rated' ? 'Rated'
    : claim === 'impact' ? 'Impact'
    : claim === 'rejected' ? 'Disputed'
    : 'Endorsed';

  // Statement lines (wrap to fit)
  const statementText = statement || '';
  const lines = wrapText(truncate(statementText, 200), 55);
  const statementLines = lines.slice(0, 3); // max 3 lines

  // Stars SVG
  let starsSection = '';
  if (stars && stars > 0) {
    const starY = 340;
    for (let i = 0; i < 5; i++) {
      const fill = i < stars ? '#F59E0B' : '#374151';
      const x = 80 + i * 36;
      starsSection += `<text x="${x}" y="${starY}" font-size="28" fill="${fill}">&#9733;</text>`;
    }
  }

  // Video indicator
  const videoIndicator = hasVideo
    ? `<g transform="translate(1020, 80)">
        <rect x="0" y="0" width="100" height="32" rx="16" fill="#059669" />
        <text x="50" y="22" text-anchor="middle" font-size="13" font-weight="600" fill="white" font-family="system-ui, -apple-system, sans-serif">VIDEO</text>
      </g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0F172A"/>
      <stop offset="100%" stop-color="#1E293B"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bg)" rx="0"/>

  <!-- Top accent line -->
  <rect x="0" y="0" width="${width}" height="4" fill="#3B82F6"/>

  <!-- LinkedTrust branding -->
  <text x="80" y="65" font-size="18" font-weight="600" fill="#94A3B8" font-family="system-ui, -apple-system, sans-serif">LinkedTrust</text>

  ${videoIndicator}

  <!-- Issuer endorsed Subject -->
  <text x="80" y="130" font-size="22" fill="#94A3B8" font-family="system-ui, -apple-system, sans-serif">${escapeXml(truncate(issuerName, 40))} ${claimLabel.toLowerCase()}</text>
  <text x="80" y="175" font-size="36" font-weight="700" fill="#F8FAFC" font-family="system-ui, -apple-system, sans-serif">${escapeXml(truncate(subjectName, 45))}</text>

  <!-- Divider -->
  <rect x="80" y="200" width="120" height="3" rx="1.5" fill="#3B82F6"/>

  <!-- Statement -->
  <text x="80" y="250" font-size="20" fill="#CBD5E1" font-family="system-ui, -apple-system, sans-serif">
    ${statementLines.map((line, i) => `<tspan x="80" dy="${i === 0 ? 0 : 28}">${escapeXml(line)}</tspan>`).join('\n    ')}
  </text>

  ${starsSection}

  <!-- Bottom bar -->
  <rect x="0" y="${height - 60}" width="${width}" height="60" fill="#0F172A" opacity="0.8"/>
  <text x="80" y="${height - 25}" font-size="15" fill="#64748B" font-family="system-ui, -apple-system, sans-serif">Verified on LinkedTrust.us</text>

  ${hasVideo ? `<text x="${width - 80}" y="${height - 25}" text-anchor="end" font-size="15" fill="#64748B" font-family="system-ui, -apple-system, sans-serif">Click to watch video</text>` : ''}
</svg>`;
}

/**
 * GET /api/og-image/:claimId
 * Returns a PNG image for OpenGraph/social sharing
 */
export async function getOgImage(req: Request, res: Response): Promise<Response | void> {
  try {
    const claimId = parseInt(req.params.claimId);
    if (isNaN(claimId) || claimId <= 0) {
      return res.status(400).json({ error: 'Invalid claim ID' });
    }

    // Check cache
    const cached = imageCache.get(claimId);
    if (cached && Date.now() - cached.generatedAt < CACHE_TTL) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(cached.png);
    }

    const data = await getClaimData(claimId);
    if (!data) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const svg = buildOgImageSvg(data);
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: 1200 },
    });
    const pngData = resvg.render();
    const pngBuffer = pngData.asPng();

    // Cache it
    imageCache.set(claimId, { png: pngBuffer, generatedAt: Date.now() });

    // Clean old cache entries periodically
    if (imageCache.size > 100) {
      const now = Date.now();
      for (const [key, val] of imageCache) {
        if (now - val.generatedAt > CACHE_TTL) imageCache.delete(key);
      }
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(pngBuffer);
  } catch (error) {
    console.error('Error generating OG image:', error);
    return res.status(500).json({ error: 'Failed to generate image' });
  }
}

/**
 * GET /api/share/:claimId
 * Returns HTML with OpenGraph meta tags for social sharing previews.
 * LinkedIn/Twitter/etc fetch this and get the og:tags.
 * Humans get redirected to the SPA.
 */
export async function getSharePage(req: Request, res: Response): Promise<Response | void> {
  try {
    const claimId = parseInt(req.params.claimId);
    if (isNaN(claimId) || claimId <= 0) {
      return res.status(400).send('Invalid claim ID');
    }

    const data = await getClaimData(claimId);
    if (!data) {
      return res.status(404).send('Claim not found');
    }

    const frontendUrl = process.env.FRONTEND_URL || process.env.BASE_URL || 'https://live.linkedtrust.us';
    const backendUrl = process.env.BACKEND_BASE_URL || `${req.protocol}://${req.get('host')}`;

    const title = `${escapeHtml(truncate(data.issuerName, 30))} endorsed ${escapeHtml(truncate(data.subjectName, 30))}`;
    const description = data.statement
      ? escapeHtml(truncate(data.statement, 200))
      : `An endorsement on LinkedTrust`;
    const ogImageUrl = `${backendUrl}/api/og-image/${claimId}`;
    const canonicalUrl = `${frontendUrl}/present/${claimId}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title} | LinkedTrust</title>

  <!-- OpenGraph (LinkedIn, Facebook, etc) -->
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="627">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="LinkedTrust">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImageUrl}">

  <!-- Redirect humans to the SPA -->
  <meta http-equiv="refresh" content="0;url=${canonicalUrl}">
  <link rel="canonical" href="${canonicalUrl}">
</head>
<body>
  <p>Redirecting to <a href="${canonicalUrl}">${title}</a>...</p>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(html);
  } catch (error) {
    console.error('Error generating share page:', error);
    return res.status(500).send('Internal server error');
  }
}

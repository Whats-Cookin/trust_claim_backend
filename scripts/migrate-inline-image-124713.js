// One-off: move the inline base64 image for claim 124713 (Image id=203, Node id=272095)
// to Backblaze B2, mirroring the app's upload logic in src/api/claims.ts.
// Usage:
//   node scripts/migrate-inline-image-124713.js            -> upload + verify only (no DB write)
//   node scripts/migrate-inline-image-124713.js --commit   -> also update DB rows
require('dotenv').config();
const crypto = require('crypto');
const https = require('https');
const AWS = require('aws-sdk');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const IMAGE_ID = 203;
const NODE_ID = 272095;
const COMMIT = process.argv.includes('--commit');

function s3() {
  return new AWS.S3({
    endpoint: process.env.LT_STORAGE_ENDPOINT,
    credentials: new AWS.Credentials({
      accessKeyId: process.env.LT_STORAGE_KEY,
      secretAccessKey: process.env.LT_STORAGE_SECRET,
    }),
    region: process.env.LT_STORAGE_REGION,
    signatureVersion: 'v4',
    s3ForcePathStyle: false,
  });
}
const bucket = () => process.env.LT_STORAGE_BUCKET;
const cdn = () => process.env.LT_STORAGE_CDN_URL;

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => resolve({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

(async () => {
  const img = await prisma.image.findUnique({ where: { id: IMAGE_ID } });
  if (!img) throw new Error('Image 203 not found');
  if (!img.url.startsWith('data:')) {
    console.log(`Image ${IMAGE_ID} url is already non-inline: ${img.url}`);
    console.log('Nothing to do. Exiting.');
    return;
  }

  const contentType = (img.metadata && img.metadata.contentType) || 'image/jpeg';
  const base64Data = img.url.replace(/^data:image\/[a-z+]+;base64,/, '');
  const buf = Buffer.from(base64Data, 'base64');
  console.log(`Decoded ${buf.length} bytes, contentType=${contentType}`);

  // Verify JPEG magic bytes
  const magic = buf.slice(0, 3).toString('hex');
  console.log(`Magic bytes: ${magic} (jpeg=ffd8ff)`);
  if (magic !== 'ffd8ff') console.warn('WARNING: not a JPEG magic header');

  // Verify sha256 matches stored digestMultibase (f + base64(sha256))
  const sha = crypto.createHash('sha256').update(buf).digest('base64');
  console.log(`sha256(base64)=${sha}`);
  console.log(`stored digest =${img.digestMultibase}  (expects f${sha})`);
  if (img.digestMultibase !== `f${sha}`) {
    throw new Error('Digest mismatch — refusing to proceed');
  }
  console.log('Digest OK ✔');

  // Build key exactly like the app: images/<owner-or-anonymous>/<ts>_<hex>.<ext>
  const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
  const ext = EXT[contentType] || 'bin';
  const userSeg = (img.owner || 'anonymous').replace(/[^a-zA-Z0-9]/g, '_') || 'anonymous';
  const key = `images/${userSeg}/${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
  console.log(`B2 key: ${key}`);

  await s3().upload({
    Bucket: bucket(),
    Key: key,
    Body: buf,
    ContentType: contentType,
    ACL: 'public-read',
  }).promise();
  const newUrl = `${cdn()}/${key}`;
  console.log(`Uploaded to B2: ${newUrl}`);

  // Verify public fetch returns exact bytes
  const got = await httpGet(newUrl);
  console.log(`Public GET -> status=${got.status} content-type=${got.headers['content-type']} bytes=${got.body.length}`);
  if (got.status !== 200) throw new Error(`Public GET not 200 (${got.status})`);
  if (got.body.length !== buf.length) throw new Error(`Public GET byte length mismatch ${got.body.length} != ${buf.length}`);
  const gotSha = crypto.createHash('sha256').update(got.body).digest('base64');
  if (gotSha !== sha) throw new Error('Public GET sha256 mismatch');
  console.log('Public fetch byte-identical ✔');

  if (!COMMIT) {
    console.log('\n--- DRY RUN complete. B2 object verified. DB NOT modified. ---');
    console.log(`Re-run with --commit to set Image.url and Node.image to:\n  ${newUrl}`);
    return;
  }

  // Update DB (both point to the same verified B2 object)
  await prisma.image.update({ where: { id: IMAGE_ID }, data: { url: newUrl } });
  const node = await prisma.node.findUnique({ where: { id: NODE_ID } });
  if (node && node.image && node.image.startsWith('data:')) {
    await prisma.node.update({ where: { id: NODE_ID }, data: { image: newUrl } });
    console.log(`Node ${NODE_ID}.image updated`);
  } else {
    console.log(`Node ${NODE_ID}.image not an inline data URI (value: ${node ? String(node.image).slice(0,60) : 'null'}) — left unchanged`);
  }
  console.log(`Image ${IMAGE_ID}.url updated`);
  console.log('\n--- COMMIT complete ---');
})()
  .catch((e) => { console.error('FAILED:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());

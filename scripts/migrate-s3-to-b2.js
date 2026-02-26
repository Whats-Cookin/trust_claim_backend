/**
 * Migrate files from AWS S3 to Backblaze B2
 *
 * Copies:
 *   trustclaims-images (us-west-1) -> B2 trustclaims-images (same paths)
 *   trustclaim-creds   (us-west-1) -> B2 trustclaims-images/creds/ (prefix added)
 *
 * Then updates Image.url in the database.
 *
 * Run: node scripts/migrate-s3-to-b2.js [--dry-run]
 */

require('dotenv').config();
const AWS = require('aws-sdk');
const { Client } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) console.log('=== DRY RUN MODE — no files will be copied, no DB changes ===\n');

// AWS S3 source client
const s3Source = new AWS.S3({
  region: 'us-west-1',
  credentials: new AWS.Credentials({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }),
});

// B2 destination client
const s3Dest = new AWS.S3({
  endpoint: process.env.LT_STORAGE_ENDPOINT,
  region: process.env.LT_STORAGE_REGION,
  credentials: new AWS.Credentials({
    accessKeyId: process.env.LT_STORAGE_KEY,
    secretAccessKey: process.env.LT_STORAGE_SECRET,
  }),
  signatureVersion: 'v4',
  s3ForcePathStyle: false,
});

const B2_BUCKET = process.env.LT_STORAGE_BUCKET;
const B2_CDN = process.env.LT_STORAGE_CDN_URL;

// Buckets to migrate: [sourceBucket, destKeyPrefix, oldUrlBase]
const MIGRATIONS = [
  {
    sourceBucket: 'trustclaims-images',
    destPrefix: '',   // keep same path
    oldUrlBase: 'https://trustclaims-images.s3.us-west-1.amazonaws.com',
  },
  {
    sourceBucket: 'trustclaim-creds',
    destPrefix: 'creds/',
    oldUrlBase: 'https://trustclaim-creds.s3.us-west-1.amazonaws.com',
  },
];

async function listAllObjects(bucket) {
  const objects = [];
  let continuationToken;
  do {
    const params = { Bucket: bucket, ContinuationToken: continuationToken };
    const res = await s3Source.listObjectsV2(params).promise();
    objects.push(...res.Contents);
    continuationToken = res.IsTruncated ? res.NextContinuationToken : null;
  } while (continuationToken);
  return objects;
}

async function copyObject(sourceBucket, sourceKey, destKey) {
  // Stream: download from S3, upload to B2
  const stream = s3Source.getObject({ Bucket: sourceBucket, Key: sourceKey }).createReadStream();

  // Get content type from head
  const head = await s3Source.headObject({ Bucket: sourceBucket, Key: sourceKey }).promise();

  await s3Dest.upload({
    Bucket: B2_BUCKET,
    Key: destKey,
    Body: stream,
    ContentType: head.ContentType || 'application/octet-stream',
    ACL: 'public-read',
  }).promise();
}

async function run() {
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();

  for (const { sourceBucket, destPrefix, oldUrlBase } of MIGRATIONS) {
    console.log(`\n--- Migrating ${sourceBucket} ---`);

    let objects;
    try {
      objects = await listAllObjects(sourceBucket);
      console.log(`Found ${objects.length} objects`);
    } catch (err) {
      console.error(`Failed to list ${sourceBucket}: ${err.message}`);
      continue;
    }

    for (const obj of objects) {
      const sourceKey = obj.Key;
      const destKey = destPrefix + sourceKey;
      const oldUrl = `${oldUrlBase}/${sourceKey}`;
      const newUrl = `${B2_CDN}/${destKey}`;

      console.log(`  ${sourceKey} -> ${destKey}`);

      if (!DRY_RUN) {
        try {
          await copyObject(sourceBucket, sourceKey, destKey);
          console.log(`    ✓ copied`);
        } catch (err) {
          console.error(`    ✗ copy failed: ${err.message}`);
          continue;
        }

        // Update Image table
        const result = await db.query(
          `UPDATE "Image" SET url = $1 WHERE url = $2 RETURNING id`,
          [newUrl, oldUrl]
        );
        if (result.rowCount > 0) {
          console.log(`    ✓ updated ${result.rowCount} Image row(s)`);
        }

        // Update Node table image field
        const nodeResult = await db.query(
          `UPDATE "Node" SET image = $1 WHERE image = $2 RETURNING id`,
          [newUrl, oldUrl]
        );
        if (nodeResult.rowCount > 0) {
          console.log(`    ✓ updated ${nodeResult.rowCount} Node row(s)`);
        }
      } else {
        // Dry run - just check DB
        const check = await db.query(
          `SELECT id FROM "Image" WHERE url = $1`,
          [oldUrl]
        );
        if (check.rowCount > 0) {
          console.log(`    would update ${check.rowCount} Image row(s) in DB`);
        }
      }
    }
  }

  await db.end();
  console.log('\nDone.');
}

run().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

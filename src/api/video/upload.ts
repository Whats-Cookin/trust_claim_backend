import { Response } from 'express';
import AWS from 'aws-sdk';
import crypto from 'crypto';
import multer from 'multer';
import { AuthRequest } from '../../lib/auth';

// Lazy-initialized S3 client (env vars may not be loaded at import time)
let s3: AWS.S3 | null = null;

function getS3Client(): AWS.S3 {
  if (!s3) {
    // Explicitly create credentials to prevent AWS SDK from using
    // AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY from environment
    const credentials = new AWS.Credentials({
      accessKeyId: process.env.LT_STORAGE_KEY || '',
      secretAccessKey: process.env.LT_STORAGE_SECRET || '',
    });

    s3 = new AWS.S3({
      endpoint: process.env.LT_STORAGE_ENDPOINT || 'https://sfo3.digitaloceanspaces.com',
      credentials,
      region: process.env.LT_STORAGE_REGION || 'sfo3',
      signatureVersion: 'v4',
      s3ForcePathStyle: false,
    });
  }
  return s3;
}

function getBucketName(): string {
  return process.env.LT_STORAGE_BUCKET || 'linkedtrust-dev';
}

function getCdnUrl(): string {
  const bucket = getBucketName();
  return process.env.LT_STORAGE_CDN_URL || `https://${bucket}.sfo3.cdn.digitaloceanspaces.com`;
}

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

// Configure multer for memory storage
const storage = multer.memoryStorage();
export const videoUploadMiddleware = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  }
}).single('video');

/**
 * Upload video directly to S3-compatible storage via backend
 * Frontend sends video file, backend uploads to DigitalOcean Spaces
 */
export async function uploadVideo(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    // Check storage config first
    if (!process.env.LT_STORAGE_KEY || !process.env.LT_STORAGE_SECRET) {
      console.error('Video upload failed: Missing LT_STORAGE_KEY or LT_STORAGE_SECRET');
      return res.status(500).json({ error: 'Video storage not configured' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const videoId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const userId = req.user?.id || 'anonymous';

    // Create a key that includes user ID for organization
    const key = `videos/${userId}/${timestamp}_${videoId}.webm`;

    console.log(`Uploading video: ${key} (${req.file.size} bytes)`);

    // Upload to S3-compatible storage
    await getS3Client().upload({
      Bucket: getBucketName(),
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'video/webm',
      ACL: 'public-read',
    }).promise();

    const videoUrl = `${getCdnUrl()}/${key}`;
    console.log(`Video uploaded successfully: ${videoUrl}`);

    res.json({
      success: true,
      videoUrl,
      videoId,
    });
  } catch (error: any) {
    console.error('Error uploading video:', error?.message || error);
    console.error('Error code:', error?.code);

    // Return actual error to frontend for debugging
    const errorMessage = error?.message || 'Unknown error';
    const errorCode = error?.code || 'UNKNOWN';

    res.status(500).json({
      error: errorMessage,
      code: errorCode,
      details: error?.code === 'SignatureDoesNotMatch'
        ? 'Storage credentials mismatch - check LT_STORAGE_KEY and LT_STORAGE_SECRET'
        : undefined
    });
  }
}

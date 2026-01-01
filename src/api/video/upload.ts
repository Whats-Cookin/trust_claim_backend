import { Request, Response } from 'express';
import AWS from 'aws-sdk';
import crypto from 'crypto';
import multer from 'multer';
import { AuthRequest } from '../../lib/auth';

// Configure S3-compatible storage
const s3 = new AWS.S3({
  endpoint: process.env.LT_STORAGE_ENDPOINT || 'https://sfo3.digitaloceanspaces.com',
  accessKeyId: process.env.LT_STORAGE_KEY,
  secretAccessKey: process.env.LT_STORAGE_SECRET,
  region: process.env.LT_STORAGE_REGION || 'sfo3',
  signatureVersion: 'v4',
  s3ForcePathStyle: false,
});

const BUCKET_NAME = process.env.LT_STORAGE_BUCKET || 'linkedtrust-dev';
const CDN_URL = process.env.LT_STORAGE_CDN_URL || `https://${BUCKET_NAME}.sfo3.cdn.digitaloceanspaces.com`;
const MAX_VIDEO_SIZE = 30 * 1024 * 1024; // 30MB

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
 * Upload video directly to S3 via backend
 * Frontend sends video file, backend uploads to DigitalOcean Spaces
 */
export async function uploadVideo(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided' });
    }

    const videoId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const userId = req.user?.id || 'anonymous';

    // Create a key that includes user ID for organization
    const key = `videos/${userId}/${timestamp}_${videoId}.webm`;

    // Upload to S3
    await s3.upload({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'video/webm',
      ACL: 'public-read',
    }).promise();

    const videoUrl = `${CDN_URL}/${key}`;

    res.json({
      success: true,
      videoUrl,
      videoId,
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ error: 'Failed to upload video' });
  }
}

/**
 * Confirm video upload and create Image record
 * Called after successful upload to store metadata
 */
export async function confirmVideoUpload(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const {
      videoId,
      videoUrl,
      duration,
      claimId,
      transcript,
      thumbnailUrl
    } = req.body;

    if (!videoUrl || !claimId) {
      return res.status(400).json({ error: 'videoUrl and claimId are required' });
    }

    // Verify the video exists in Spaces (optional but recommended)
    try {
      const key = videoUrl.replace(CDN_URL + '/', '');
      await s3.headObject({
        Bucket: BUCKET_NAME,
        Key: key
      }).promise();
    } catch (error) {
      return res.status(404).json({ error: 'Video not found in storage' });
    }

    // Create Image record for the video
    const { prisma } = await import('../../lib/prisma');

    const videoRecord = await prisma.image.create({
      data: {
        claimId: parseInt(claimId),
        url: videoUrl,
        digestMultibase: videoId,
        metadata: {
          type: 'video',
          contentType: 'video/webm',
          filename: `video_${claimId}.webm`,
          duration: Math.min(duration || 30, 30),
          thumbnail: thumbnailUrl,
          transcript: transcript || null,
          originalUrl: videoUrl,
          recordedAt: new Date().toISOString(),
          purpose: 'validation'
        },
        effectiveDate: new Date(),
        owner: req.user?.id || 'anonymous',
        signature: generateVideoSignature(videoUrl, req.user?.id || 'anonymous')
      }
    });

    res.json({
      success: true,
      video: videoRecord
    });
  } catch (error) {
    console.error('Error confirming video upload:', error);
    res.status(500).json({ error: 'Failed to confirm video upload' });
  }
}

/**
 * Get videos for a claim
 */
export async function getClaimVideos(req: Request, res: Response): Promise<Response | void> {
  try {
    const { claimId } = req.params;
    const { prisma } = await import('../../lib/prisma');

    const videos = await prisma.image.findMany({
      where: {
        claimId: parseInt(claimId),
        metadata: {
          path: ['$.type'],
          equals: 'video'
        }
      },
      orderBy: {
        createdDate: 'desc'
      }
    });

    res.json({ videos });
  } catch (error) {
    console.error('Error fetching claim videos:', error);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
}

/**
 * Delete a video (mark as deleted, don't actually remove)
 */
export async function deleteVideo(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const { videoId } = req.params;
    const { prisma } = await import('../../lib/prisma');

    const video = await prisma.image.findUnique({
      where: { id: parseInt(videoId) }
    });

    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    if (video.owner !== req.user?.id && req.user?.id) {
      return res.status(403).json({ error: 'Not authorized to delete this video' });
    }

    await prisma.image.update({
      where: { id: parseInt(videoId) },
      data: {
        metadata: {
          ...(video.metadata as any),
          deleted: true,
          deletedAt: new Date().toISOString()
        }
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ error: 'Failed to delete video' });
  }
}

function generateVideoSignature(videoUrl: string, userId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${videoUrl}:${userId}:${Date.now()}`)
    .digest('base64');
}

export function checkVideoConfig(): { configured: boolean; missing: string[] } {
  const required = [
    'LT_STORAGE_ENDPOINT',
    'LT_STORAGE_KEY',
    'LT_STORAGE_SECRET',
    'LT_STORAGE_BUCKET'
  ];

  const missing = required.filter(key => !process.env[key]);

  return {
    configured: missing.length === 0,
    missing
  };
}

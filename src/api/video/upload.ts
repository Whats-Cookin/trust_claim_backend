import { Request, Response } from 'express';
import AWS from 'aws-sdk';
import crypto from 'crypto';
import { AuthRequest } from '../../lib/auth';

// Configure DigitalOcean Spaces (S3-compatible)
const spacesEndpoint = new AWS.Endpoint(process.env.DO_SPACES_ENDPOINT || 'nyc3.digitaloceanspaces.com');
const s3 = new AWS.S3({
  endpoint: spacesEndpoint as any,
  accessKeyId: process.env.DO_SPACES_KEY,
  secretAccessKey: process.env.DO_SPACES_SECRET,
  region: process.env.DO_SPACES_REGION || 'nyc3',
  signatureVersion: 'v4'
});

const BUCKET_NAME = process.env.DO_SPACES_BUCKET || 'linkedtrust-videos';
const CDN_URL = process.env.DO_SPACES_CDN_URL || `https://${BUCKET_NAME}.nyc3.cdn.digitaloceanspaces.com`;
const MAX_VIDEO_SIZE = 30 * 1024 * 1024; // 30MB max (roughly 30 seconds)

/**
 * Generate a presigned URL for direct video upload from browser
 * This allows the frontend to upload directly to DigitalOcean Spaces
 * without sending the video through our backend
 */
export async function getVideoUploadUrl(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    // Generate unique video ID
    const videoId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    const userId = req.user?.id || 'anonymous';
    
    // Create a key that includes user ID for organization
    const key = `videos/${userId}/${timestamp}_${videoId}.webm`;
    
    // Generate presigned POST data for secure upload
    // Using POST instead of PUT for better browser compatibility
    const params = {
      Bucket: BUCKET_NAME,
      Fields: {
        key: key,
        'Content-Type': 'video/webm',
        'x-amz-meta-userid': userId,
        'x-amz-meta-purpose': 'validation',
        'x-amz-meta-max-duration': '30'
      },
      Expires: 300, // URL expires in 5 minutes
      Conditions: [
        ['content-length-range', 0, MAX_VIDEO_SIZE],
        ['starts-with', '$Content-Type', 'video/'],
        {'x-amz-meta-userid': userId}
      ]
    };
    
    // Generate the presigned POST data
    const presignedPost = s3.createPresignedPost(params);
    
    // Generate video metadata
    const videoUrl = `${CDN_URL}/${key}`;
    const thumbnailUrl = `${CDN_URL}/${key.replace('.webm', '_thumb.jpg')}`; // We'll generate this later
    
    res.json({
      uploadData: presignedPost,
      videoId,
      videoUrl,
      thumbnailUrl,
      maxDuration: 30,
      maxSizeMB: 30,
      expiresIn: 300
    });
  } catch (error) {
    console.error('Error generating video upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
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
        digestMultibase: videoId, // Using videoId as a simple identifier
        metadata: {
          type: 'video',
          duration: Math.min(duration || 30, 30), // Enforce 30 second max
          thumbnail: thumbnailUrl,
          transcript: transcript || null,
          mimeType: 'video/webm',
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
    
    // Find the video
    const video = await prisma.image.findUnique({
      where: { id: parseInt(videoId) }
    });
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    // Check ownership
    if (video.owner !== req.user?.id && req.user?.id) {
      return res.status(403).json({ error: 'Not authorized to delete this video' });
    }
    
    // Soft delete by updating metadata
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

// Helper function to generate a simple signature for the video
function generateVideoSignature(videoUrl: string, userId: string): string {
  return crypto
    .createHash('sha256')
    .update(`${videoUrl}:${userId}:${Date.now()}`)
    .digest('base64');
}

// Environment variable checks
export function checkVideoConfig(): { configured: boolean; missing: string[] } {
  const required = [
    'DO_SPACES_ENDPOINT',
    'DO_SPACES_KEY', 
    'DO_SPACES_SECRET',
    'DO_SPACES_BUCKET'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  return {
    configured: missing.length === 0,
    missing
  };
}

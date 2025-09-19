import { Response } from 'express';
import { AuthRequest } from '../../lib/auth';
import { S3 } from 'aws-sdk';
import crypto from 'crypto';

// Configure S3 client for DigitalOcean Spaces
const spacesEndpoint = new S3({
  endpoint: process.env.DO_SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com',
  accessKeyId: process.env.DO_SPACES_KEY || '',
  secretAccessKey: process.env.DO_SPACES_SECRET || '',
  s3ForcePathStyle: false,
  signatureVersion: 'v4',
});

const BUCKET_NAME = process.env.DO_SPACES_BUCKET || 'linkedtrust-videos';
const CDN_URL = process.env.DO_SPACES_CDN_URL || `https://${BUCKET_NAME}.nyc3.cdn.digitaloceanspaces.com`;

/**
 * @swagger
 * /api/video/upload-url:
 *   post:
 *     summary: Get a presigned URL for video upload
 *     description: Returns a presigned URL for uploading a video validation (max 30 seconds)
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upload URL and final video URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uploadUrl:
 *                   type: string
 *                   description: Presigned URL for uploading the video
 *                 videoUrl:
 *                   type: string
 *                   description: Final URL where the video will be accessible
 *                 videoId:
 *                   type: string
 *                   description: Unique identifier for the video
 *                 expiresIn:
 *                   type: number
 *                   description: Seconds until the upload URL expires
 */
export async function getVideoUploadUrl(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const userId = req.user?.id || 'anonymous';
    const videoId = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now();
    
    // Create a path that includes user ID for organization
    const key = `videos/${userId}/${timestamp}_${videoId}.webm`;
    
    // Generate presigned URL with constraints
    const uploadUrl = await spacesEndpoint.getSignedUrlPromise('putObject', {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: 300, // 5 minutes to upload
      ContentType: 'video/webm',
      // Set max file size to ~30MB (30 seconds at ~1MB/sec)
      Conditions: [
        ['content-length-range', 0, 30 * 1024 * 1024],
        ['starts-with', '$Content-Type', 'video/']
      ],
      // Add CORS headers
      ResponseContentDisposition: 'inline',
    });
    
    const videoUrl = `${CDN_URL}/${key}`;
    
    res.json({
      uploadUrl,
      videoUrl,
      videoId,
      expiresIn: 300
    });
  } catch (error) {
    console.error('Error generating video upload URL:', error);
    res.status(500).json({ error: 'Failed to generate upload URL' });
  }
}

/**
 * @swagger
 * /api/video/thumbnail-url:
 *   post:
 *     summary: Get a presigned URL for thumbnail upload
 *     description: Returns a presigned URL for uploading a video thumbnail
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               videoId:
 *                 type: string
 *                 description: The video ID this thumbnail belongs to
 *     responses:
 *       200:
 *         description: Upload URL for thumbnail
 */
export async function getThumbnailUploadUrl(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const { videoId } = req.body;
    const userId = req.user?.id || 'anonymous';
    
    if (!videoId) {
      return res.status(400).json({ error: 'videoId is required' });
    }
    
    const timestamp = Date.now();
    const key = `thumbnails/${userId}/${timestamp}_${videoId}.jpg`;
    
    const uploadUrl = await spacesEndpoint.getSignedUrlPromise('putObject', {
      Bucket: BUCKET_NAME,
      Key: key,
      Expires: 300,
      ContentType: 'image/jpeg',
      Conditions: [
        ['content-length-range', 0, 2 * 1024 * 1024] // Max 2MB for thumbnail
      ]
    });
    
    const thumbnailUrl = `${CDN_URL}/${key}`;
    
    res.json({
      uploadUrl,
      thumbnailUrl,
      expiresIn: 300
    });
  } catch (error) {
    console.error('Error generating thumbnail upload URL:', error);
    res.status(500).json({ error: 'Failed to generate thumbnail URL' });
  }
}

/**
 * @swagger
 * /api/video/create-validation:
 *   post:
 *     summary: Create a video validation claim
 *     description: Creates a claim with video evidence for validation
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - videoUrl
 *             properties:
 *               subject:
 *                 type: string
 *                 description: URI of the entity being validated
 *               videoUrl:
 *                 type: string
 *                 description: URL of the uploaded video
 *               thumbnailUrl:
 *                 type: string
 *                 description: URL of the video thumbnail
 *               duration:
 *                 type: number
 *                 description: Duration of video in seconds
 *               transcript:
 *                 type: string
 *                 description: Text transcript of the video
 *               statement:
 *                 type: string
 *                 description: Additional written statement
 */
export async function createVideoValidation(req: AuthRequest, res: Response): Promise<Response | void> {
  try {
    const { subject, videoUrl, thumbnailUrl, duration, transcript, statement } = req.body;
    const userId = req.user?.id || req.body.issuerId;
    
    if (!subject || !videoUrl) {
      return res.status(400).json({ error: 'subject and videoUrl are required' });
    }
    
    if (duration && duration > 30) {
      return res.status(400).json({ error: 'Video duration cannot exceed 30 seconds' });
    }
    
    // Import the claims API to create the claim
    const { createClaim } = await import('../claims');
    
    // Create the claim with video evidence
    const claimReq = {
      ...req,
      body: {
        subject,
        claim: 'VALIDATES',
        object: subject, // Validating the subject directly
        sourceURI: videoUrl,
        howKnown: 'FIRST_HAND',
        confidence: 0.95, // High confidence for video validation
        statement: statement || transcript || 'Video validation',
        issuerId: userId,
      }
    };
    
    // Create the claim
    await createClaim(claimReq as AuthRequest, res);
    
    // If the response was sent by createClaim, get the claim from the response
    if (res.headersSent) {
      const responseData = (res as any).locals.responseData;
      if (responseData?.claim) {
        // Create image record for the video
        const { prisma } = await import('../../lib/prisma');
        await prisma.image.create({
          data: {
            claimId: responseData.claim.id,
            url: videoUrl,
            digestMultibase: crypto.createHash('sha256').update(videoUrl).digest('hex'),
            metadata: {
              type: 'video',
              duration: duration || 0,
              thumbnail: thumbnailUrl,
              transcript: transcript,
              mimeType: 'video/webm'
            },
            effectiveDate: new Date(),
            owner: userId || 'anonymous',
            signature: 'pending' // Would be signed by the uploader in production
          }
        });
      }
    }
  } catch (error) {
    console.error('Error creating video validation:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create video validation' });
    }
  }
}

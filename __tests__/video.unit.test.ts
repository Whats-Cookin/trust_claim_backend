import { Response } from 'express';

// Set env vars before importing module
process.env.LT_STORAGE_KEY = 'test-key';
process.env.LT_STORAGE_SECRET = 'test-secret';
process.env.LT_STORAGE_BUCKET = 'test-bucket';

import { uploadVideo, videoUploadMiddleware } from '../src/api/video/upload';
import { AuthRequest } from '../src/lib/auth';

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  const mockUpload = jest.fn().mockReturnValue({
    promise: jest.fn().mockResolvedValue({ Location: 'https://test.com/video.webm' })
  });

  return {
    S3: jest.fn().mockImplementation(() => ({
      upload: mockUpload
    }))
  };
});

describe('Video Upload', () => {
  describe('uploadVideo', () => {
    let mockReq: Partial<AuthRequest>;
    let mockRes: Partial<Response>;
    let mockJson: jest.Mock;
    let mockStatus: jest.Mock;

    beforeEach(() => {
      mockJson = jest.fn();
      mockStatus = jest.fn().mockReturnValue({ json: mockJson });

      mockReq = {
        user: { id: '123' },
        file: {
          buffer: Buffer.from('test video content'),
          mimetype: 'video/webm',
          originalname: 'test.webm',
          size: 1000,
          fieldname: 'video',
          encoding: '7bit',
          destination: '',
          filename: '',
          path: '',
          stream: {} as any
        }
      };

      mockRes = {
        json: mockJson,
        status: mockStatus
      };
    });

    it('should return 400 if no file is provided', async () => {
      mockReq.file = undefined;

      await uploadVideo(mockReq as AuthRequest, mockRes as Response);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ error: 'No video file provided' });
    });

    it('should upload video and return videoUrl', async () => {
      await uploadVideo(mockReq as AuthRequest, mockRes as Response);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          videoUrl: expect.stringContaining('videos/123/'),
          videoId: expect.any(String)
        })
      );
    });

    it('should use anonymous if no user', async () => {
      mockReq.user = undefined;

      await uploadVideo(mockReq as AuthRequest, mockRes as Response);

      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          videoUrl: expect.stringContaining('videos/anonymous/')
        })
      );
    });
  });

  describe('videoUploadMiddleware', () => {
    it('should be a multer middleware', () => {
      expect(videoUploadMiddleware).toBeDefined();
      expect(typeof videoUploadMiddleware).toBe('function');
    });
  });
});

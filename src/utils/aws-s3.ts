import {
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";
import { optimizeImage } from "./images";

// Helper to check if S3 configuration is complete
function isS3Configured(): boolean {
  return !!(
    config?.s3 &&
    config.s3?.region &&
    config.s3?.accessKeyId &&
    config.s3?.secretAccessKey &&
    config.s3?.bucketName
  );
}

export const s3Client: S3Client | null = config.s3?.accessKeyId && config.s3?.secretAccessKey
  ? new S3Client({
      region: config.s3?.region ?? 'us-east-1',
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    })
  : null;


export async function uploadImageToS3(
  filename: string,
  file: Express.Multer.File
): Promise<void> {
  // If S3 is not configured, return early
  if (!s3Client || !isS3Configured()) {
    console.warn('S3 is not configured. Skipping upload.');
    return;
  }

  try {
    const optimizedImage = await optimizeImage(file.buffer);
    const params: PutObjectCommandInput = {
      Key: filename,
      Body: optimizedImage,
      ContentType: file.mimetype,
      Bucket: config?.s3?.bucketName,
    };
    const command = new PutObjectCommand(params);
    await s3Client.send(command);
  } catch (error) {
    console.error('Error uploading to S3:', error);
    if (error instanceof S3ServiceException) {
      throw new Error(`Failed to upload image to S3: ${error.message}`);
    }
    throw new Error('Failed to upload image to S3');
  }
}

export async function getS3SignedUrl(filename: string): Promise<string | null> {
  if (!s3Client || !config.s3?.bucketName) {
    console.warn('S3 is not configured. Cannot generate signed URL.');
    return null;
  }

  try {
    const params: GetObjectCommandInput = {
      Key: filename,
      Bucket: config.s3.bucketName,
    };
    const command = new GetObjectCommand(params);
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    console.error('Error generating signed URL:', error);
    if (error instanceof S3ServiceException) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
    throw new Error('Failed to generate signed URL');
  }
}

export async function getS3SignedUrlIfExisted(
  filename?: string | null
): Promise<string | null> {
  if (!filename) return null;
  return getS3SignedUrl(filename);
}

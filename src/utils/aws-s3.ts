import {
  GetObjectCommand,
  GetObjectCommandInput,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";
import { optimizeImage } from "./images";

export const s3Client = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

export async function uploadImageToS3(filename: string, file: Express.Multer.File) {
  const optimizedImage = await optimizeImage(file.buffer);
  const params: PutObjectCommandInput = {
    Key: filename,
    Body: optimizedImage,
    ContentType: file.mimetype,
    Bucket: config.s3.bucketName,
  };
  const command = new PutObjectCommand(params);
  return s3Client.send(command);
}

export function getS3SignedUrl(filename: string): Promise<string> {
  const params: GetObjectCommandInput = {
    Key: filename,
    Bucket: config.s3.bucketName,
  };
  const command = new GetObjectCommand(params);
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function getS3SignedUrlIfExisted(filename?: string | null): Promise<string | null> {
  if (!filename) return null;
  return getS3SignedUrl(filename);
}

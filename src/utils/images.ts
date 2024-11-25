import sharp from "sharp";
import { z } from "zod";
import { getS3SignedUrl } from "./aws-s3";

export function optimizeImage(img: Buffer): Promise<Buffer> {
  return sharp(img).jpeg({ quality: 80 }).toBuffer();
}

export async function getUrl(filenameOrUrl: string) {
  const { success } = z.string().url().safeParse(filenameOrUrl);
  if (success) return filenameOrUrl;
  return await getS3SignedUrl(filenameOrUrl);
}

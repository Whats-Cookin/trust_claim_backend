import { z } from "zod";

const schema = z.object({
  s3: z.object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    region: z.string(),
    bucketName: z.string(),
  }),
});

const config = schema.parse({
  s3: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_S3_REGION_NAME,
    bucketName: process.env.AWS_STORAGE_BUCKET_NAME,
  },
});

export { config };

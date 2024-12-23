// src/config/index.ts
import { z } from "zod";

const schema = z.object({
  dataPipeline: z.object({
    url: z.string().url().optional(),
  }),

  s3: z
    .object({
      accessKeyId: z.string(),
      secretAccessKey: z.string(),
      region: z.string(),
      bucketName: z.string(),
    })
    .optional(),
});

export type Config = z.infer<typeof schema>;

export const config: Config = {
  dataPipeline: {
    url: process.env.DATA_PIPELINE_MS,
  },
  s3:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_S3_REGION_NAME ?? "",
          bucketName: process.env.AWS_STORAGE_BUCKET_NAME ?? "",
        }
      : undefined,
};

// src/utils/aws-s3.ts
import { S3Client } from "@aws-sdk/client-s3";

export const s3Client = config.s3
  ? new S3Client({
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    })
  : null;

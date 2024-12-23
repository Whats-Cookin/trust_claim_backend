import { Request } from "express";
import multer from "multer";

const IMAGES_FIELD_NAME = "images" as const;
const DTO_FIELD_NAME = "dto" as const;

export type MulterRequest = Request & {
  files: {
    [IMAGES_FIELD_NAME]?: Express.Multer.File[];
    [DTO_FIELD_NAME]?: Express.Multer.File[];
  };
};

export type ProtectedMulterRequest = MulterRequest & {
  isAuthenticated: boolean;
  userId: number;
};

export const upload = multer({ storage: multer.memoryStorage() }).fields([
  { name: IMAGES_FIELD_NAME, maxCount: 10 },
  { name: DTO_FIELD_NAME, maxCount: 1 },
]);

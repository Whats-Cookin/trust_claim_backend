import { Request } from "express";
import multer from "multer";

const FIELD_NAME = "images" as const;

export type MulterRequest = Request & {
  files: Express.Multer.File[];
};

export type ProtectedMulterRequest = MulterRequest & {
  isAuthenticated: boolean;
  userId: number;
};

export const upload = multer({ storage: multer.memoryStorage() }).array(FIELD_NAME);

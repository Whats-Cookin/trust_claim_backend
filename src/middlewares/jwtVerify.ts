import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import createError from "http-errors";

interface ModifiedRequest extends Request {
  isAuthenticated?: boolean;
  userId?: number | string;
}

interface JWTDecoded {
  aud: string;
}

export function jwtVerify(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return next(new createError.Unauthorized("No token provided"));
  }

  // ✅ Static token support for extractor
  if (token === process.env.EXTRACTOR_API_TOKEN) {
    (req as ModifiedRequest).isAuthenticated = true;
    (req as ModifiedRequest).userId = "extractor";
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.ACCESS_SECRET as string) as JWTDecoded;
    (req as ModifiedRequest).isAuthenticated = true;
    (req as ModifiedRequest).userId = parseInt(decoded.aud);
    next();
  } catch (err: any) {
    const message = err.name === "JsonWebTokenError" ? "Unauthorized" : err.message;
    next(new createError.Unauthorized(message));
  }
}

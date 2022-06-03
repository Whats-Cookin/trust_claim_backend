import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import createError from "http-errors";

export const jwtVerify = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_SECRET as string);
      (req as ModifiedRequest).isAuthenticated = true;
      (req as ModifiedRequest).userId = (decoded as JWTDecoded).aud;
      next();
    } catch (err: any) {
      const message =
        err.name === "JsonWebTokenError" ? "Unauthorized" : err.message;
      next(new createError.Unauthorized(message));
    }
  } else {
    next(new createError.Unauthorized("Access token required"));
  }
};

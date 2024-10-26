import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import createError from "http-errors";

export function jwtVerify(req: Request, _res: Response, next: NextFunction) {
  // If request has claimAddress and issuerId, allow it through
  if (req.body.claimAddress && req.body.issuerId) {
    (req as ModifiedRequest).isAuthenticated = false; // or true depending on your needs
    (req as ModifiedRequest).userId = 0;
    return next();
  }

  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      throw new Error("Unauthorized");
    }

    const decoded = jwt.verify(token, process.env.ACCESS_SECRET as string);
    (req as ModifiedRequest).isAuthenticated = true;
    (req as ModifiedRequest).userId = parseInt((decoded as JWTDecoded).aud);
    next();
  } catch (err: any) {
    const message = err.name === "JsonWebTokenError" ? "Unauthorized" : err.message;
    next(new createError.Unauthorized(message));
  }
}

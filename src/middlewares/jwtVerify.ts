import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import createError from "http-errors";

export const jwtVerify = (req: Request, _res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_SECRET as string);
      (req as ModifiedRequest).isAuthenticated = true;
      (req as ModifiedRequest).userId = parseInt((decoded as JWTDecoded).aud);
      next();
    } catch (err: any) {
      const message =
        err.name === "JsonWebTokenError" ? "Unauthorized" : err.message;
      next(new createError.Unauthorized(message));
    }
  } else {
    (req as ModifiedRequest).isAuthenticated = false;
    (req as ModifiedRequest).userId = 0;
    // now we will need to check the did is right
    // we can verify the request directly if it has a claimAddress
    // so we don't really need a user login
    //    next(new createError.Unauthorized("Access token required"));
    next();
  }
};

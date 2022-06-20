import { NextFunction } from "express";
import JWT from "jsonwebtoken";

export const generateJWT = (
  userId: number,
  email: string,
  tokenType: "access" | "refresh"
): string => {
  try {
    let secretVar: string;
    let expiresIn: string | undefined;
    switch (tokenType) {
      case "access":
        secretVar = "ACCESS_SECRET";
        expiresIn = "1d";
        break;
      case "refresh":
        secretVar = "REFRESH_SECRET";
        expiresIn = "1y";
        break;
    }

    const secret: string = process.env[secretVar] as string;
    const payload = { email };
    const options = {
      expiresIn,
      issuer: "trustclaims.whatscookin.us",
      audience: String(userId),
    };

    const token = JWT.sign(payload, secret, options);

    return token;
  } catch (err) {
    throw err;
  }
};

export const verifyRefreshToken = (refreshToken: string) => {
  const decoded = JWT.verify(
    refreshToken,
    process.env.REFRESH_SECRET as string as string
  );
  const { email, aud: userId } = decoded as JWTDecoded;
  return { email, userId };
};

export const passToExpressErrorHandler = (err: any, next: NextFunction) => {
  if (!err.statusCode) {
    err.statusCode = 500;
    err.message = "Could not process the request. Try again later!";
  }
  next(err);
};

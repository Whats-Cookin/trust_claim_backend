import dotenv from "dotenv";
import { NextFunction } from "express";
import JWT from "jsonwebtoken";
import axios from "axios";
import qs from "qs";
import { prisma } from "../db/prisma";
import { AuthType } from "@prisma/client";

dotenv.config();

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
    console.log(err.message);
    err.message = "Could not process the request, check inputs and try again";
  }
  next(err);
};

export const turnFalsyPropsToUndefined = (obj: { [key: string]: any }) => {
  const newObj = { ...obj };
  const newObjAsArray = Object.entries(newObj);

  newObjAsArray.forEach(([key, val]) => {
    if (!val) {
      newObj[key] = undefined;
    }
  });
  return newObj;
};

interface Mapping {
  [key: string]: {
    [key: string]: string;
  };
}

// handle common mis-keys
const SIMILAR_MAP: Mapping = {
  howKnown: { website: "WEB_DOCUMENT", WEBSITE: "WEB_DOCUMENT" },
};

export const poormansNormalizer = (obj: { [key: string]: any }) => {
  const newObj = { ...obj };
  const newObjAsArray = Object.entries(newObj);

  newObjAsArray.forEach(([key, val]) => {
    if (key in SIMILAR_MAP && val in SIMILAR_MAP[key]) {
      newObj[key] = SIMILAR_MAP[key][val];
    }
  });
  return newObj;
};

interface GoogleTokensResult {
  access_token: string;
  expires_in: Number;
  refresh_token: string;
  scope: string;
  id_token: string;
}

export const getGoogleAuthTokens = async (
  code: string
): Promise<GoogleTokensResult> => {
  const url = "https://oauth2.googleapis.com/token";

  const values = {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  };

  try {
    const res = await axios.post<GoogleTokensResult>(
      url,
      qs.stringify(values),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return res.data;
  } catch (error: any) {
    console.error(error);
    throw new Error(error.message);
  }
};

export const getOrCreateUser = async (
  email: string,
  name: string,
  id: string,
  authType: AuthType
) => {
  let user = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { authType: authType, authProviderId: id }],
    },
  });

  if (
    user &&
    ((email && !user.email) ||
      (user.authType !== authType && user.authProviderId !== id))
  ) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        email,
        authType: authType,
        authProviderId: id,
      },
    });
  }

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: email,
        authType: authType,
        authProviderId: id,
        name,
      },
    });
  }
  return user;
};

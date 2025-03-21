import { NextFunction } from "express";
import JWT from "jsonwebtoken";

export const generateJWT = (userId: number, email: string, tokenType: "access" | "refresh"): string => {
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
  const decoded = JWT.verify(refreshToken, process.env.REFRESH_SECRET as string as string);
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

export function turnFalsyPropsToUndefined<T extends Record<keyof any, unknown>>(obj: T): Partial<T> {
  const newObj = structuredClone(obj);

  for (const [key, val] of Object.entries(newObj)) {
    if (!val) {
      // @ts-expect-error ignore type for the new object
      newObj[key] = undefined;
    }
  }

  return newObj;
}

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

export const makeClaimSubjectURL = (claimId: string, host: string) => {
  return `https://${host}/claims/${claimId}`;
};

export const decodeGoogleCredential = (accessToken: string) => {
  const { name, email, sub } = JWT.decode(accessToken) as GoogleCredentialDecoded;

  return {
    name,
    email,
    googleId: sub,
  };
};

export const getClaimNameFromNodeUri = (nodeUri: string | undefined | null): string | null => {
  if (!nodeUri) return null;

  try {
    const formattedUri = nodeUri.startsWith("http") ? nodeUri : `https://${nodeUri}`;
    const url = new URL(formattedUri);

    const domain = url.hostname.replace(/^www\./, "");

    const pathParts = url.pathname.split("/").filter(Boolean);

    // Define common social media platforms and their username extraction logic
    const socialMediaPatterns: { [key: string]: number } = {
      "linkedin.com": 1, // linkedin.com/in/username
      "twitter.com": 0, // twitter.com/username
      "x.com": 0, // x.com/username
      "instagram.com": 0, // instagram.com/username
      "facebook.com": 0, // facebook.com/username or facebook.com/profile.php?id=xyz
      "tiktok.com": 1, // tiktok.com/@username
      "github.com": 0, // github.com/username
      "youtube.com": 1, // youtube.com/c/username or youtube.com/user/username
      "medium.com": 0, // medium.com/@username
      "reddit.com": 1, // reddit.com/user/username
    };

    // Extract username if domain is a known social media platform
    const usernameIndex = socialMediaPatterns[domain];
    if (usernameIndex !== undefined && pathParts.length > usernameIndex) {
      return capitalizeFirstLetter(pathParts[usernameIndex].replace("@", ""));
    }

    return capitalizeFirstLetter(domain.replace(".com", ""));
  } catch (error) {
    console.error("Failed to parse URL:", error);
    return null;
  }
};

const capitalizeFirstLetter = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1);

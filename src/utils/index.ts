import { NextFunction } from 'express';
import JWT from 'jsonwebtoken';

export const generateJWT = (
  userId: number,
  email: string,
  tokenType: 'access' | 'refresh'
): string => {
  try {
    let secretVar: string;
    let expiresIn: string | undefined;
    switch (tokenType) {
      case 'access':
        secretVar = 'ACCESS_SECRET';
        expiresIn = '1d';
        break;
      case 'refresh':
        secretVar = 'REFRESH_SECRET';
        expiresIn = '1y';
        break;
    }

    const secret: string = process.env[secretVar] as string;
    const payload = { email };
    const options = {
      expiresIn,
      issuer: 'trustclaims.whatscookin.us',
      audience: String(userId)
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
    err.message = 'Could not process the request, check inputs and try again';
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
  howKnown: { website: 'WEB_DOCUMENT', WEBSITE: 'WEB_DOCUMENT' }
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

export const makeClaimSubjectURL = (claimId: string) => {
  return `https://live.linkedtrust.us/claims/${claimId}`;
};

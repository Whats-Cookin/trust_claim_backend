import { Request } from "express";
declare global {
  interface HttpException extends Error {
    statusCode?: number;
    data?: string;
  }

  export interface JWTDecoded {
    email: string;
    iat: number;
    exp: number;
    aud: string;
    iss: string;
  }

  export interface ModifiedRequest extends Request {
    isAuthenticated: boolean;
    userId: number;
  }
}

export {};

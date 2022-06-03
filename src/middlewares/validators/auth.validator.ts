import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import { passToExpressErrorHandler } from "../../utils";

const authSignupSchema = Joi.object({
  email: Joi.string().email({ minDomainSegments: 2 }).required(),
  password: Joi.string().min(6).required(),
});

export const authSignupValidator = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    await authSignupSchema.validateAsync(req.body);

    next();
  } catch (err: any) {
    passToExpressErrorHandler(err, next);
  }
};

const authRefreshTokenSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

export const authRefreshTokenValidator = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    await authRefreshTokenSchema.validateAsync(req.body);

    next();
  } catch (err: any) {
    passToExpressErrorHandler(err, next);
  }
};

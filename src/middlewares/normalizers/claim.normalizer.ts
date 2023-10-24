import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import { passToExpressErrorHandler } from "../../utils";

export const claimPostNormalizer = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    const howKnown = req.body.howKnown;
    if (typeof howKnown === "string") {
      req.body.howKnown = howKnown.toUpperCase();
    }
    next();
  } catch (err: any) {
    err.statusCode = 400;
    passToExpressErrorHandler(err, next);
  }
};

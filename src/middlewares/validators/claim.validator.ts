import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import { passToExpressErrorHandler } from "../../utils";

const claimPostSchema = Joi.object({
  subject: Joi.string().required(),
  claim: Joi.string().required(),
  object: Joi.string().allow(""),
  qualifier: Joi.string().allow(""),
  aspect: Joi.string().allow(""),
  howKnown: Joi.string().allow(""),
  source: Joi.string().allow(""),
  effectiveDate: Joi.date(),
  confidence: Joi.number().min(0.0).max(1.0),
  reviewRating: Joi.number().custom((value, helpers) => {
    const ancestor = helpers.state.ancestors?.[0];

    if (value < 0.0) {
      throw new Error("reviewRating must NOT be a value lower than 0");
    } else if (
      ancestor.claim &&
      ancestor.aspect &&
      ancestor.claim == "rated" &&
      ancestor.aspect.includes("quality:") &&
      value > 5.0
    ) {
      throw new Error(
        'When claim is "rated" and the claim is from a quality aspect, reviewRating must be a value between 0 and 5'
      );
    }
    return true;
  }),
});

export const claimPostValidator = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  try {
    await claimPostSchema.validateAsync(req.body);
    next();
  } catch (err: any) {
    err.statusCode = 400;
    passToExpressErrorHandler(err, next);
  }
};

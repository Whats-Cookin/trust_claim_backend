
import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import { passToExpressErrorHandler } from "../../utils";

const claimPostSchema = Joi.object({
  subject: Joi.string().required(),
  claim: Joi.string().required(),
  issuerId: Joi.string().allow(""),
  object: Joi.string().allow(""),
  statement: Joi.string().allow(""),
  aspect: Joi.string().allow(""),
  amt: Joi.alternatives().try(
    Joi.string()
      .allow("")
      .custom((value, helpers) => {
        const strippedValue = value.replace(/\$|\s+/g, ""); // Strip $ and spaces
        if (strippedValue === "") {
          return null; // Convert empty string to null
        }
        const numberValue = parseFloat(strippedValue);
        if (isNaN(numberValue)) {
          throw new Error("Can't convert aspect to number");
        }
        return numberValue; // Return the converted number
      }),
    Joi.number()
  ),
  name: Joi.string().required(),
  howKnown: Joi.string().allow(""),
  images: Joi.array().items(
    Joi.object({
      url: Joi.string().required(),
      metadata: Joi.object().allow(null).pattern(/.*/, Joi.any()),
      effectiveDate: Joi.date().allow(null),
      digestMultibase: Joi.string().allow(null),
      signature: Joi.string().required(),
      owner: Joi.string().allow(""),
    })
  ).allow(null),
  sourceURI: Joi.string().allow(""),
  effectiveDate: Joi.date(),
  confidence: Joi.number().min(0.0).max(1.0),
  claimAddress: Joi.string().allow(""),
  stars: Joi.number().custom((value, helpers) => {
    const ancestor = helpers.state.ancestors?.[0];

    if (value < 0.0) {
      throw new Error("rating 'stars' must NOT be a value lower than 0");
    } else if (
      ancestor.claim &&
      ancestor.aspect &&
      ancestor.claim == "rated" &&
      ancestor.aspect.includes("quality:") &&
      value > 5.0
    ) {
      throw new Error(
        'When claim is "rated" and the claim is from a quality aspect, rating "stars" must be a value between 0 and 5'
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
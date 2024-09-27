import { z } from "zod";
import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import { passToExpressErrorHandler } from "../../utils";
import { howKnowns } from "../../config/enums";
import { NotEmpty } from "../../types/utils";
import { HowKnown } from "@prisma/client";

export function joiValidator(schema: Joi.Schema) {
  return async function claimPostValidator(
    req: Request,
    _res: Response,
    next: NextFunction,
  ) {
    try {
      await schema.validateAsync(req.body);
      next();
    } catch (err: any) {
      err.statusCode = 400;
      passToExpressErrorHandler(err, next);
    }
  };
}

export function zodValidator(schema: z.Schema) {
  return async function claimPostValidator(
    req: Request,
    _res: Response,
    next: NextFunction,
  ) {
    try {
      req.body = await schema.parse(req.body);
      next();
    } catch (err: any) {
      err.statusCode = 422;
      passToExpressErrorHandler(err, next);
    }
  };
}

export const claimPostSchema = Joi.object({
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
    Joi.number(),
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
      owner: Joi.string().required(),
    }),
  ),
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
        'When claim is "rated" and the claim is from a quality aspect, rating "stars" must be a value between 0 and 5',
      );
    }
    return true;
  }),
});

export type ImageDto = {
  url: string;
  signature: string;
  metadata?: {
    description?: string;
    caption?: string;
  };
  digestedMultibase?: string;
  effectiveDate: Date;
};

export const CreateClaimV2Dto = z
  .object({
    subject: z.string(),
    claim: z.string(),
    object: z.string().optional(),
    statement: z.string().optional(),
    aspect: z.string().optional(),
    amt: z.coerce.number().or(
      z
        .string()
        .regex(/\s*\$\s*\d+\s*/)
        .transform(stripCurrencyToFloat),
    ),
    name: z.string(),
    howKnown: z.enum(howKnowns as NotEmpty<HowKnown>).optional(),
    sourceURI: z.string().optional(),
    effectiveDate: z.coerce.date(),
    confidence: z.coerce.number().min(0).max(1),
    claimAddress: z.string().optional(),
    stars: z.coerce.number().min(0).optional(),

    imagesDescription: z
      .array(z.string().nullable())
      .or(z.string().nullable())
      .optional(),
    imagesCaption: z
      .array(z.string().nullable())
      .or(z.string().nullable())
      .optional(),
    imagesEffectiveDate: z
      .array(z.coerce.date())
      .or(z.coerce.date())
      .optional(),
    // // TODO: what is this?
    // imagesDigestMultibase: z
    //   .array(z.string().nullable())
    //   .or(z.string().nullable())
    //   .optional(),
    // // TODO: what is this?
    // imagesSignature: z
    //   .array(z.string().nullable())
    //   .or(z.string().nullable())
    //   .optional(),
  })
  .refine(validateImagesMetadata, {
    message: "Images metadata are missing data",
    path: ["images"],
  })
  .refine(validateStars, {
    message:
      'When claim is "rated" and the claim is from a quality aspect, rating "stars" must be a value between 0 and 5',
    path: ["stars"],
  });
export type CreateClaimV2Dto = z.infer<typeof CreateClaimV2Dto>;

export function validateImages(
  files: Express.Multer.File[],
  dto: CreateClaimV2Dto,
): boolean {
  if (!dto.imagesEffectiveDate && !files.length) return true;
  if (!Array.isArray(dto.imagesEffectiveDate) && files.length === 1)
    return true;
  return (dto.imagesEffectiveDate as Date[]).length === files.length;
}

function stripCurrencyToFloat(val: string): number | null {
  const strippedValue = val.replace(/\$|\s+/g, "");
  const num = parseFloat(strippedValue);
  if (Number.isNaN(num)) {
    return null;
  }
  return num;
}

function validateImagesMetadata(data: Record<string, unknown>): boolean {
  const dfltKey = data.imagesEffectiveDate;
  const imageData = [
    data.imagesCaption,
    data.imagesDescription,
    data.imagesEffectiveDate,
    // data.imagesSignature,
    // data.imagesDigestMultibase,
  ];
  const len = !dfltKey ? 0 : !Array.isArray(dfltKey) ? 1 : dfltKey.length;

  return (
    imageData.every(
      (x) => Array.isArray(x) && (x as string | string[]).length === len,
    ) ||
    imageData.every((x) => typeof x === "string") ||
    imageData.every((x) => x !== undefined)
  );
}

function validateStars(data: Record<string, unknown>): boolean {
  if (
    data.claim &&
    data.aspect &&
    data.claim === "rated" &&
    (data.aspect as string | undefined)?.includes("quality:") &&
    (data.stars as number) > 5
  )
    return false;
  return true;
}

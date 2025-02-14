import { z } from "zod";
import Joi from "joi";
import { Request, Response, NextFunction } from "express";
import { passToExpressErrorHandler } from "../../utils";
import { NotEmpty } from "../../types/utils";
import { HowKnown } from "@prisma/client";

export function joiValidator(schema: Joi.Schema) {
  return async function claimPostValidator(req: Request, _res: Response, next: NextFunction) {
    try {
      await schema.validateAsync(req.body);
      next();
    } catch (err: any) {
      err.statusCode = 400;
      passToExpressErrorHandler(err, next);
    }
  };
}

export const claimPostSchema = Joi.object({
  subject: Joi.string().required(),
  claim: Joi.string().required(),
  issuerId: Joi.string().allow("", null),
  object: Joi.string().allow("", null),
  statement: Joi.string().allow(""),
  aspect: Joi.string().allow("", null),
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
  name: Joi.string().allow("", null),
  howKnown: Joi.string().allow("", null),
  images: Joi.array().items(
    Joi.object({
      url: Joi.string().required(),
      metadata: Joi.object().allow(null).pattern(/.*/, Joi.any()),
      effectiveDate: Joi.date().allow(null),
      digestMultibase: Joi.string().allow(null),
      signature: Joi.string().allow(null),
      owner: Joi.string().allow(null),
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
  metadata?: {
    description?: string;
    caption?: string;
  };
  digestedMultibase?: string;
  effectiveDate: Date;
  signature: string;
};

// ValidationSchema Version: 2024-03-26
export const CreateClaimV2Dto = z
  .object({
    subject: z.string(),
    claim: z.string(),
    object: z.string().nullable().optional().default(""),
    statement: z.string().nullable().optional().default(""),
    aspect: z.string().nullable().optional(),
    amt: z
      .number()
      .nullable()
      .optional()
      .or(
        z
          .string()
          .regex(/\s*\$?\s*\d*\s*/, {
            message: "Can't convert aspect to number",
          })
          .transform(stripCurrencyToFloat),
      ),
    name: z.string().nullable().optional(),
    issuerId: z.string().nullable().optional(),
    howKnown: z
      .enum(Object.values(HowKnown) as NotEmpty<HowKnown>)
      .nullable()
      .optional(),
    sourceURI: z.string().nullable().optional().default(""),
    effectiveDate: z.coerce.date().nullable().optional(),
    confidence: z.number().min(0).max(1).nullable().optional(),
    claimAddress: z.string().nullable().optional(),
    stars: z
      .union([
        z.number().min(0),
        z.string().transform((str) => {
          const num = Number(str);
          if (num < 0) throw new Error("rating 'stars' must NOT be a value lower than 0");
          return num;
        }),
      ])
      .nullable()
      .optional(),
    images: z
      .array(
        z.object({
          metadata: z
            .object({
              description: z.string().nullable().optional(),
              caption: z.string().nullable().optional(),
            })
            .optional(),
          effectiveDate: z.coerce.date().nullable().optional(),
          digestMultibase: z.string().nullable().optional(),
        }),
      )
      .default([]),
  })
  .refine(validateStars, {
    message:
      'When claim is "rated" and the claim is from a quality aspect, rating "stars" must be a value between 0 and 5',
    path: ["stars"],
  });

export type CreateClaimV2Dto = z.infer<typeof CreateClaimV2Dto>;

function stripCurrencyToFloat(val: string): number | null {
  const strippedValue = val.replace(/\$|\s+/g, "");
  const num = parseFloat(strippedValue);
  if (Number.isNaN(num)) {
    return null;
  }
  return num;
}

function validateStars(data: Record<string, unknown>): boolean {
  return !(
    data.claim &&
    data.claim === "rated" &&
    data.aspect &&
    (data.aspect as string | undefined)?.includes("quality:") &&
    (data.stars as number) > 5
  );
}

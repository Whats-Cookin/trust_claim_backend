import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { Prisma } from "prisma/prisma-client";
import { passToExpressErrorHandler, turnFalsyPropsToUndefined } from "../utils";
import createError from "http-errors";
import axios from "axios";
import { z, AnyZodObject, ZodError } from "zod";

export async function zParse<T extends AnyZodObject>(
  schema: T,
  req: Request
): Promise<z.infer<T>> {
  return schema.parseAsync(req);
}

const claimSchema = z.object({
  body: z.object({
    subject: z.string(),
    object: z.string(),
    claim: z.string(),
    //qualifier: z.string().optional(),
    aspect: z.string().optional(),
    howKnown: z.string().optional(),
    source: z.string().optional(),
    effectiveDate: z.string().optional(),
    confidence: z.number().optional(),
    //reviewRating: z.number().optional(),
  }),
});

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let claim;
  const { body } = claimSchema.parse(req);
  try {
    const userId = (req as ModifiedRequest).userId;
    //const rawClaim: any = turnFalsyPropsToUndefined(req.body);
    const sourceID = body.source;
    delete body.source;
    claim = await prisma.claim.create({
      data: {
        //userId,
        issuerId: `http://trustclaims.whatscookin.us/users/${userId}`,
        issuerIdType: "URL",
        sourceID,
        ...body,
      },
    });
  } catch (err) {
    console.error(err);
    passToExpressErrorHandler(err, next);
  }

  if (
    process.env.COMPOSEDB_URL &&
    process.env.COMPOSEDB_USERNAME &&
    process.env.COMPOSEDB_PASSWORD &&
    claim
  ) {
    try {
      const { id: claimId, ...rest } = claim;
      await axios.post(
        process.env.COMPOSEDB_URL,
        { claimId, ...rest },
        {
          auth: {
            username: process.env.COMPOSEDB_USERNAME,
            password: process.env.COMPOSEDB_PASSWORD,
          },
        }
      );
    } catch (err: any) {
      console.error(err);
    }
  }

  res.status(201).json(claim);
};

export const claimGet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search, page = 0, limit = 0 } = req.query;
    const { claimId } = req.params;

    if (claimId) {
      const claim = await prisma.claim.findUnique({
        where: {
          id: Number(claimId),
        },
      });

      if (!claim) {
        throw new createError.NotFound("Claim does not exist");
      }

      res.status(201).json(claim);
      return;
    }

    let claims = [];
    let count = 0;
    if (search) {
      const query: Prisma.ClaimWhereInput = {
        OR: [
          { subject: { contains: search as string, mode: "insensitive" } },
          { object: { contains: search as string, mode: "insensitive" } },
        ],
      };
      claims = await prisma.claim.findMany({
        where: query,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit) ? Number(limit) : undefined,
      });
      count = await prisma.claim.count({ where: query });
    } else {
      count = await prisma.claim.count({});
      claims = await prisma.claim.findMany({
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit) > 0 ? Number(limit) : undefined,
      });
    }

    res.status(201).json({ claims, count });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { Prisma } from "prisma/prisma-client";
import { passToExpressErrorHandler, turnFalsyPropsToUndefined } from "../utils";
import createError from "http-errors";
import axios from "axios";

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let claim;
  try {
    const userId = (req as ModifiedRequest).userId;
    const rawClaim: any = turnFalsyPropsToUndefined(req.body);
    claim = await prisma.claim.create({
      data: {
        issuerId: `http://trustclaims.whatscookin.us/users/${userId}`,
        issuerIdType: "URL",
        ...rawClaim,
      },
    });
  } catch (err) {
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
	  timeout: 1000,
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

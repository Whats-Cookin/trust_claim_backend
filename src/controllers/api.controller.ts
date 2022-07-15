import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { Claim } from "prisma/prisma-client";
import { passToExpressErrorHandler, turnFalsyPropsToUndefined } from "../utils";
import createError from "http-errors";

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as ModifiedRequest).userId;
    const rawClaim: any = turnFalsyPropsToUndefined(req.body);
    const claim: Claim = await prisma.claim.create({
      data: {
        userId,
        issuerId: `http://trustclaims.whatscookin.us/users/${userId}`,
        issuerIdType: "URL",
        ...rawClaim,
      },
    });

    res.status(201).json(claim);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const claimSearch = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search } = req.query;

    if (!search) {
      throw new createError.BadRequest("Need a search query");
    }

    const claims = await prisma.claim.findMany({
      where: {
        OR: [
          { subject: { contains: search as string, mode: "insensitive" } },
          { object: { contains: search as string, mode: "insensitive" } },
        ],
      },
    });

    res.status(201).json(claims);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

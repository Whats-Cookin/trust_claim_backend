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

export const claimGet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { search } = req.query;
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
    if (search) {
      claims = await prisma.claim.findMany({
        where: {
          OR: [
            { subject: { contains: search as string, mode: "insensitive" } },
            { object: { contains: search as string, mode: "insensitive" } },
          ],
        },
      });
    } else {
      claims = await prisma.claim.findMany({});
    }

    res.status(201).json(claims);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

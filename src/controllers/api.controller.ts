import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { passToExpressErrorHandler, turnFalsyPropsToUndefined } from "../utils";

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as ModifiedRequest).userId;
    const rawClaim: any = turnFalsyPropsToUndefined(req.body);
    const claim = await prisma.claim.create({
      data: { userId, ...rawClaim },
    });

    res.status(201).json(claim);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

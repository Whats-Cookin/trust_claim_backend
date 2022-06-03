import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import { passToExpressErrorHandler } from "../utils";

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const claim = await prisma.claim.create({
      data: req.body,
    });

    res.status(201).json(claim);
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

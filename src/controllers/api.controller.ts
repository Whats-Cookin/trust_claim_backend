import { prisma } from "../db/prisma";
import { Request, Response, NextFunction } from "express";
import { NodeType } from "prisma/prisma-client";
import {
  passToExpressErrorHandler,
  turnFalsyPropsToUndefined,
  getClaimUrl,
} from "../utils";
import createError from "http-errors";

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = (req as ModifiedRequest).userId;
    const rawClaim: any = turnFalsyPropsToUndefined(req.body);
    const claim = await prisma.claim.create({
      data: {
        userId,
        issuerId: `http://trustclaims.whatscookin.us/users/${userId}`,
        issuerIdType: "URL",
        ...rawClaim,
      },
    });

    const claimUrl = getClaimUrl(claim.id);

    let claimQueries = [{ subject: claim.subject }, { object: claim.subject }];

    if (claim.object) {
      claimQueries = [
        ...claimQueries,
        { subject: claim.object },
        { object: claim.object },
      ];
    }

    const matchedClaims = await prisma.claim.findMany({
      where: {
        OR: claimQueries,
        NOT: { id: claim.id },
      },
    });

    const claimEdges = matchedClaims.map((matchedClaim) => {
      return {
        nodeOne: getClaimUrl(matchedClaim.id),
        nodeOneId: matchedClaim.id,
        nodeOneType: "CLAIM" as NodeType,
        nodeTwo: claimUrl,
        nodeTwoId: claim.id,
        nodeTwoType: "CLAIM" as NodeType,
      };
    });

    const issuerEdge = {
      nodeOneId: userId,
      nodeOne: `http://trustclaims.whatscookin.us/users/${userId}`,
      nodeOneType: "ISSUER" as NodeType,
      nodeTwo: claimUrl,
      nodeTwoId: claim.id,
      nodeTwoType: "CLAIM" as NodeType,
    };

    const edges = [issuerEdge, ...claimEdges];

    await prisma.edge.createMany({ data: edges });

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

import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import {
  passToExpressErrorHandler,
  turnFalsyPropsToUndefined,
  poormansNormalizer,
} from "../utils";
import createError from "http-errors";

import { ClaimDao, NodeDao } from "../dao/api.dao";

const claimDao = new ClaimDao();
const nodeDao = new NodeDao();

export const claimPost = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let claim;
  let claimData;
  let claimImages;
  try {
    const userId = (req as ModifiedRequest).userId;
    let rawClaim: any = turnFalsyPropsToUndefined(req.body);
    rawClaim = poormansNormalizer(rawClaim);
    rawClaim.effectiveDate = new Date(rawClaim.effectiveDate);
    claim = await claimDao.createClaim(userId, rawClaim);
    claimData = await claimDao.createClaimData(claim.id, rawClaim.name);
    claimImages = await claimDao.createImages(
      claim.id,
      userId,
      rawClaim.images
    );
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }

  res.status(201).json({ claim, claimData, claimImages });
};

export const claimGetById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { claimId } = req.params;
    const id = Number(claimId);

    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid claim ID" });
    }

    const { claim, claimData, claimImages } = await claimDao.getClaimById(id);

    if (!claim) {
      throw new createError.NotFound("Not Found");
    }

    res.status(201).json({ claim, claimData, claimImages });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const getAllClaims = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const claims = await prisma.claim.findMany();
    const claimsData = [];
    for (const claim of claims) {
      const data = await claimDao.getClaimData(claim.id as any);
      const images = await claimDao.getClaimImages(claim.id as any);
      claimsData.push({ data, claim, images });
    }
    const count = await prisma.claim.count({});

    res.status(201).json({ claimsData, count });
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
    const { search, page = 1, limit = 10 } = req.query;

    let claims = [];
    let count;

    if (search) {
      const searchResult = await claimDao.searchClaims(
        search as string,
        Number(page),
        Number(limit)
      );
      claims = searchResult.claimData;
      count = searchResult.count;
    } else {
      count = await prisma.claim.count();
      const claimsData = await prisma.claim.findMany({
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit) > 0 ? Number(limit) : undefined,
      });
      for (const claim of claimsData) {
        const data = await claimDao.getClaimData(claim.id);
        const images = await claimDao.getClaimImages(claim.id);
        const relatedNodes = await claimDao.getRelatedNodes(claim.id);
        claims.push({ data, claim, images, relatedNodes });
      }
    }

    res.status(200).json({ claims, count });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const claimsGet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page = 0, limit = 0 } = req.query;

    const nodes = await nodeDao.getNodes(Number(page), Number(limit));
    res.status(200).json(nodes);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};
/*********************************************************************/

export const claimsFeed = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // const { search } = req.query; // unused for now, TODO here search
    const { page = 1, limit = 100, search = "" } = req.query; // defaults provided here

    // Convert them to numbers

    const offset = (Number(page) - 1) * Number(limit);

    const feed_entries = await nodeDao.getFeedEntries(offset, Number(limit), String(search));
    res.status(200).json(feed_entries);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

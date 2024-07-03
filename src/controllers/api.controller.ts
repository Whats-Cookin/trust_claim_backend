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
    console.log("======== ", rawClaim);
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
      console.log(claim.id);
      const data = await claimDao.getClaimData(claim.id as any);
      const images = await claimDao.getClaimImages(claim.id as any);
      console.log(data);
      console.log(claim);
      claimsData.push({ data, claim, images });
    }
    res.status(200).json(claimsData);
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
    const { search, page = 0, limit = 0 } = req.query;

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
      count = await prisma.claim.count({});
      const claimsData = await prisma.claim.findMany({
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit) > 0 ? Number(limit) : undefined,
      });
      for (const claim of claimsData) {
        const data = await claimDao.getClaimData(claim.id as any);
        const images = await claimDao.getClaimImages(claim.id as any);
        claims.push({ data, claim, images });
      }
    }

    res.status(201).json({ claims, count });
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
    let { page = 1, limit = 100 } = req.query; // defaults provided here

    // Convert them to numbers
    page = Number(page);
    limit = Number(limit);

    const offset = (page - 1) * limit;

    const feed_entries = await nodeDao.getFeedEntries(offset, limit);
    res.status(200).json(feed_entries);
    return;
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

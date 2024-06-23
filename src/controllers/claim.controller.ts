import { Request, Response, NextFunction } from "express";
import {
  passToExpressErrorHandler,
  // turnFalsyPropsToUndefined,
  // poormansNormalizer,
  // makeClaimSubjectURL,
} from "../utils";

import ClaimDao from "../dao/claim.dao";


export default class ClaimController {
  static searchIfSubjectExists = async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const claimDao = new ClaimDao();
    const subject = req.query.subject as string;
    try {
      const result = await claimDao.searchIfSubjectExists(subject);
      res
        .status(200)
        .json({ message: "Subjects Retreived Successfully", data: result });
    } catch (err) {
      console.log(err);
      passToExpressErrorHandler(err, next);
    }
  };

  static createClaim = async (req: Request, res: Response, next: NextFunction) => {
    const claimDao = new ClaimDao();
    const claim = req.body;
    const userId = (req as ModifiedRequest).userId;

    try {

      const createClaimBasedOnType = async (claim: any) => {
        claim.issuerId = `http://trustclaims.whatscookin.us/users/${userId}`;
        claim.issuerIdType = 'URL';

        if (claim.type === "report") return await claimDao.createReport(claim);
        if (claim.type === "rating") return await claimDao.createRating(claim);
        if (claim.type === "impact") return await claimDao.createImpact(claim);
        if (claim.type === "relatedTo") return await claimDao.createRelatedTO(claim);
        if (claim.type === "validation") return await claimDao.createValidation(claim);
      }

      let newClaim;
      // if claimId is present, then it is a subclaim
      // it will be ralted directly to the claim we have in the database
      if (claim.claimId) {
          await createClaimBasedOnType(claim);
          return res.status(201).json({ message: "Claim Created Successfully", data: newClaim });
        }
      const basicClaim  = await claimDao.createClaim(claim);
      const claimId = basicClaim?.id;
      claim.id = claimId;

      await createClaimBasedOnType(claim);

      res.status(201).json({ message: "Claim Created Successfully", data: newClaim });
    } catch (err) {
      console.log(err);
      passToExpressErrorHandler(err, next);
    }
  };

  static getClaimById = async (req: Request, res: Response, next: NextFunction) => {
    const claimDao = new ClaimDao();
    const id = parseInt(req.params.id);
    try {
      const result = await claimDao.getClaimById(id);
      res.status(200).json({ message: "Claim Retreived Successfully", data: result });
    } catch (err) {
      console.log(err);
      passToExpressErrorHandler(err, next);
    }
  }

  static getAllClaims = async (req: Request, res: Response, next: NextFunction) => {
    const claimDao = new ClaimDao();
    try {
      const result = await claimDao.getAllClaims();
      res.status(200).json({ message: "Claims Retreived Successfully", data: result });
    } catch (err) {
      console.log(err);
      passToExpressErrorHandler(err, next);
    }
  }

  static searchClaims = async (req: Request, res: Response, next: NextFunction) => {
    const claimDao = new ClaimDao();
    const search = req.query.search as string;
    try {
      const result = await claimDao.searchClaims(search);
      res.status(200).json({ message: "Claims Retreived Successfully", data: result });
    } catch (err) {
      console.log(err);
      passToExpressErrorHandler(err, next);
    }
  }
}

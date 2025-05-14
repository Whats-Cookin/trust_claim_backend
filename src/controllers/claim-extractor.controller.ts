import { Request, Response, NextFunction } from "express";
import { ClaimExtractorDao } from "../dao/claim-extractor.dao";
import { CreateClaimExtractorDto } from "../middlewares/validators/claim-extractor.validator";
import { passToExpressErrorHandler } from "../utils";
import createError from "http-errors";

const claimExtractorDao = new ClaimExtractorDao();

// Submit a new claim from an extractor (no auth required)
export const submitClaim = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = CreateClaimExtractorDto.safeParse(req.body);
    
    if (!result.success) {
      throw createError(422, "Invalid claim data", { details: result.error.errors });
    }

    const claim = await claimExtractorDao.createClaim(result.data);

    return res.status(201).json({
      message: "Claim submitted successfully",
      claim: {
        id: claim.id,
        status: claim.status,
        subject: claim.subject,
        claim: claim.claim,
        createdAt: claim.createdAt,
      },
    });
  } catch (error) {
    passToExpressErrorHandler(error, next);
  }
};

// Link a claim to the currently authenticated user
export const linkClaimToUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const claimId = parseInt(req.params.id);
    const userId = (req as any).userId;

    if (isNaN(claimId)) {
      throw createError(400, "Invalid claim ID");
    }

    if (!userId) {
      throw createError(401, "Authentication required");
    }

    const updatedClaim = await claimExtractorDao.linkClaimToUser(claimId, userId);

    return res.status(200).json({
      message: "Claim linked successfully",
      claim: {
        id: updatedClaim.id,
        status: updatedClaim.status,
        linkedUserId: updatedClaim.linkedUserId,
        updatedAt: updatedClaim.updatedAt,
      },
    });
  } catch (error) {
    passToExpressErrorHandler(error, next);
  }
}; 
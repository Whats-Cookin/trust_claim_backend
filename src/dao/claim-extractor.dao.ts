import { prisma } from "../db/prisma";
import { CreateClaimExtractorDto } from "../middlewares/validators/claim-extractor.validator";
import createError from "http-errors";

export class ClaimExtractorDao {
  // Create a new claim from an extractor
  async createClaim(data: CreateClaimExtractorDto) {
    try {
      const claim = await prisma.claimExtractor.create({
        data: {
          ...data,
          status: "pending", // Always start as pending
        },
      });
      return claim;
    } catch (error) {
      console.error("Error creating claim extractor:", error);
      throw createError(500, "Failed to create claim");
    }
  }

  // Get a claim by ID
  async getClaimById(id: number) {
    try {
      const claim = await prisma.claimExtractor.findUnique({
        where: { id },
      });

      if (!claim) {
        throw createError(404, "Claim not found");
      }

      return claim;
    } catch (error) {
      if (error instanceof createError.HttpError) {
        throw error;
      }
      console.error("Error fetching claim extractor:", error);
      throw createError(500, "Failed to fetch claim");
    }
  }

  // Link a claim to a user
  async linkClaimToUser(claimId: number, userId: number) {
    try {
      // First check if claim exists and is not already linked
      const claim = await this.getClaimById(claimId);

      if (claim.status === "linked") {
        throw createError(400, "Claim is already linked to a user");
      }

      if (claim.linkedUserId) {
        throw createError(400, "Claim is already linked to a user");
      }

      // Update the claim
      const updatedClaim = await prisma.claimExtractor.update({
        where: { id: claimId },
        data: {
          linkedUserId: userId,
          status: "linked",
        },
      });

      return updatedClaim;
    } catch (error) {
      if (error instanceof createError.HttpError) {
        throw error;
      }
      console.error("Error linking claim to user:", error);
      throw createError(500, "Failed to link claim to user");
    }
  }
} 
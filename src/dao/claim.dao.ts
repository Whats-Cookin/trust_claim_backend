// import { prisma } from '../db/prisma';
import { prisma } from "../db/prisma";
import {
  // ClaimI,
  // EdgeI,
  // ImpactI,
  OtherSubjectUrlI,
  // RatingI,
  // RelatedTOI,
  // ReportI,
  // ValidationI,
} from "../claimI";
import { Prisma } from "@prisma/client";

export default class ClaimDao {
  searchIfSubjectExists = async (subject: string) => {
    const result = await prisma.claim.findMany({
      where: {
        subjectName: {
          contains: subject,
          mode: "insensitive",
        },
      },
    });
    return result;
  };

  async createClaim(claim: Prisma.ClaimCreateInput) {
    const { otherSubjectUrls, ...claimData } = claim;

    const result = await prisma.claim.create({
      data: claimData,
    });

    if (otherSubjectUrls) {
      for (const otherSubjectUrl of otherSubjectUrls as OtherSubjectUrlI[]) {
        await this.createOtherSubjectUrl({
            ...otherSubjectUrl,
            claim: {
                connect: {
                    id: result.id
                }
            },
        });
      }
    }
    const finalResult = await this.getClaimById(result.id);
    return finalResult;
  }

  async createOtherSubjectUrl(data: Prisma.OtherSubjectUrlsCreateInput) {
    return await prisma.otherSubjectUrls.create({
      data,
    });
  }

  // createEdge = async (edge: EdgeI) => {
  //     const result = await prisma.edge.create({
  //         data: edge
  //     });
  //     return result;
  // }

  createReport = async (report: Prisma.ReportCreateInput) => {
    const result = await prisma.report.create({
      data: report,
    });
    return result;
  };

  createRating = async (rating: Prisma.RatingCreateInput) => {
    const result = await prisma.rating.create({
      data: rating,
    });
    return result;
  };

  createImpact = async (impact: Prisma.ImpactCreateInput) => {
    const result = await prisma.impact.create({
      data: impact,
    });
    return result;
  };

  createRelatedTO = async (relatedTO: Prisma.RelatedTOCreateInput) => {
    const result = await prisma.relatedTO.create({
      data: relatedTO,
    });
    return result;
  };

  createValidation = async (validation: Prisma.ValidationCreateInput) => {
    const result = await prisma.validation.create({
      data: validation,
    });
    return result;
  };

  getClaimById = async (id: number) => {
    const result = await prisma.claim.findUnique({
      where: {
        id: id,
      },
      include: {
        otherSubjectUrls: true,
        edges: true,
        reports: true,
        ratings: true,
        impacts: true,
        relatedTOs: true,
        validations: true,
      },
    });
    return result;
  };

  getAllClaims = async () => {
    const result = await prisma.claim.findMany({
      include: {
        otherSubjectUrls: true,
        edges: true,
        reports: true,
        ratings: true,
        impacts: true,
        relatedTOs: true,
        validations: true,
      },
    });
    return result;
  };

  searchClaims = async (searchQuery: string) => {
    const result = await prisma.claim.findMany({
      where: {
        subjectName: {
          contains: searchQuery,
          mode: "insensitive",
        },
        subjectMainUrl: {
          contains: searchQuery,
          mode: "insensitive",
        },
      },
      include: {
        otherSubjectUrls: {
          where: {
            url: {
              contains: searchQuery,
              mode: "insensitive",
            },
          },
        },
        edges: true,
        reports: true,
        ratings: true,
        impacts: true,
        relatedTOs: true,
        validations: true,
      },
    });

    return result;
  };
}

import { z } from "zod";
import { HowKnown } from "@prisma/client";
import { NotEmpty } from "../../types/utils";

// Validation schema for submitting a claim from an extractor
export const CreateClaimExtractorDto = z.object({
  subject: z.string().min(1, "Subject is required"),
  claim: z.string().min(1, "Claim is required"),
  object: z.string().nullable().optional(),
  statement: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  howKnown: z.enum(Object.values(HowKnown) as NotEmpty<HowKnown>).nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
  sourceURI: z.string().nullable().optional(),
  effectiveDate: z.coerce.date().nullable().optional(),
  aspect: z.string().nullable().optional(),
  score: z.number().nullable().optional(),
  stars: z.number().min(0).max(5).nullable().optional(),
  amt: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  howMeasured: z.string().nullable().optional(),
  intendedAudience: z.string().nullable().optional(),
  respondAt: z.string().nullable().optional(),
  issuerId: z.string().nullable().optional(),
  issuerIdType: z.string().nullable().optional(),
  claimAddress: z.string().nullable().optional(),
  proof: z.string().nullable().optional(),
});

export type CreateClaimExtractorDto = z.infer<typeof CreateClaimExtractorDto>;

// Validation schema for linking a claim to a user
export const LinkClaimExtractorDto = z.object({
  id: z.number().int().positive(),
});

export type LinkClaimExtractorDto = z.infer<typeof LinkClaimExtractorDto>; 
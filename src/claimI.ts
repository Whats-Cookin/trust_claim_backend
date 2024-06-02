import { HowKnown, SourceTypeOfSubject } from "@prisma/client";

export interface ClaimI {
  id?: number;
  createdAt?: Date;
  lastUpdatedAt?: Date;
  sourceTypeOfSubject?: SourceTypeOfSubject;
  subjectMainUrl: string;
  subjectName: string;
  otherSubjectUrls: OtherSubjectUrlI[];
  edges: EdgeI[];
  reports: ReportI[];
  ratings: RatingI[];
  impacts: ImpactI[];
  relatedTOs: RelatedTOI[];
  validations: ValidationI[];
}

export interface OtherSubjectUrlI {
  id?: number;
  claimId: number;
  createdAt?: Date;
  updatedAt?: Date;
  url: string;
  urlType: SourceTypeOfSubject;
}

export interface EdgeI {
  id?: number;
  startNodeId: number;
  endNodeId?: number;
  label: string;
  thumbnail?: string;
  claimId: number;
}

export interface ReportI {
  id?: number;
  claimId: number;
  createdAt?: Date;
  updatedAt?: Date;
  statement: string;
  howKnown: HowKnown;
  confidence: number;
  sourceURI: string;
  effectiveDate?: Date;
  issuerId: string;
  issuerIdType: string;
}

export interface RatingI {
  id?: number;
  claimId: number;
  createdAt?: Date;
  updatedAt?: Date;
  statement: string;
  confidence: number;
  howKnown: HowKnown;
  aspect: string;
  stars: number;
  sourceURI: string;
  effectiveDate?: Date;
  issuerId: string;
  issuerIdType: string;
}

export interface ImpactI {
  id?: number;
  claimId: number;
  createdAt?: Date;
  updatedAt?: Date;
  statement: string;
  confidence: number;
  howKnown: HowKnown;
  value: string;
  sourceURI: string;
  effectiveDate?: Date;
  issuerId: string;
  issuerIdType: string;
}

export interface RelatedTOI {
  id?: number;
  claimId: number;
  createdAt?: Date;
  updatedAt?: Date;
  statement: string;
  confidence: number;
  howKnown: HowKnown;
  sourceURI: string;
  effectiveDate?: Date;
  issuerId: string;
  issuerIdType: string;
}

export interface ValidationI {
  id?: number;
  claimId: number;
  createdAt?: Date;
  updatedAt?: Date;
  statement: string;
  confidence: number;
  howKnown: HowKnown;
  sourceURI: string;
  effectiveDate?: Date;
  issuerId: string;
  issuerIdType: string;
}

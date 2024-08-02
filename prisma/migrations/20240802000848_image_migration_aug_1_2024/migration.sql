-- CreateEnum
ALTER TYPE "AuthType" ADD VALUE 'OAUTH';

-- CreateEnum
CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('GREEN', 'YELLOW', 'GREY', 'RED');

-- CreateTable
CREATE TABLE "ClaimData" (
    "id" SERIAL NOT NULL,
    "claimId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "ClaimData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" SERIAL NOT NULL,
    "claimId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "digestMultibase" TEXT,
    "metadata" JSONB,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "owner" TEXT NOT NULL,
    "signature" TEXT NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidUserInfo" (
    "id" SERIAL NOT NULL,
    "claimId" INTEGER,
    "firstName" TEXT,
    "lastName" TEXT,
    "candid_entity_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "profileURL" TEXT NOT NULL,

    CONSTRAINT "CandidUserInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ValidationRequest" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" TEXT NOT NULL,
    "validatorName" TEXT NOT NULL,
    "validatorEmail" TEXT NOT NULL,
    "claimId" INTEGER NOT NULL,
    "validationClaimId" INTEGER,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "response" "ResponseStatus",
    "validationDate" TIMESTAMP(3),
    "statement" TEXT,

    CONSTRAINT "ValidationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimData_claimId_key" ON "ClaimData"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidUserInfo_claimId_key" ON "CandidUserInfo"("claimId");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationRequest_validationClaimId_key" ON "ValidationRequest"("validationClaimId");


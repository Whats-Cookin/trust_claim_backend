-- CreateEnum
CREATE TYPE "IssuerIdType" AS ENUM ('DID', 'ETH', 'PUBKEY');

-- CreateEnum
CREATE TYPE "SignedClaimType" AS ENUM ('CERAMIC', 'NFT', 'CRYPTOJSON', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" SERIAL NOT NULL,
    "subject" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "object" TEXT,
    "qualifier" TEXT,
    "aspect" TEXT,
    "howKnown" TEXT,
    "source" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "confidence" INTEGER,
    "reviewRating" INTEGER,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignedClaim" (
    "id" SERIAL NOT NULL,
    "claimId" INTEGER NOT NULL,
    "issuerId" TEXT NOT NULL,
    "issuerIdType" "IssuerIdType" NOT NULL DEFAULT E'DID',
    "signedAddress" TEXT NOT NULL,
    "signedClaimType" "SignedClaimType" NOT NULL DEFAULT E'CERAMIC',
    "signedClaimBlob" JSONB,

    CONSTRAINT "SignedClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SignedClaim_claimId_key" ON "SignedClaim"("claimId");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedClaim" ADD CONSTRAINT "SignedClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

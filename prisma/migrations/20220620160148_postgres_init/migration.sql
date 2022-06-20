/*
  Warnings:

  - Added the required column `userId` to the `Claim` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "IssuerIdType" AS ENUM ('DID', 'ETH', 'PUBKEY');

-- CreateEnum
CREATE TYPE "SignedClaimType" AS ENUM ('CERAMIC', 'NFT', 'CRYPTOJSON', 'OTHER');

-- AlterTable
ALTER TABLE "Claim" ADD COLUMN     "userId" INTEGER NOT NULL,
ALTER COLUMN "object" DROP NOT NULL,
ALTER COLUMN "howKnown" DROP NOT NULL,
ALTER COLUMN "source" DROP NOT NULL,
ALTER COLUMN "effectiveDate" DROP NOT NULL;

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
CREATE UNIQUE INDEX "SignedClaim_claimId_key" ON "SignedClaim"("claimId");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignedClaim" ADD CONSTRAINT "SignedClaim_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

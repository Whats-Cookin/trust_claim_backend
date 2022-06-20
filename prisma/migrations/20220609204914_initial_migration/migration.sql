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
    "object" TEXT NOT NULL,
    "qualifier" TEXT,
    "aspect" TEXT,
    "howKnown" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "confidence" INTEGER,
    "reviewRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

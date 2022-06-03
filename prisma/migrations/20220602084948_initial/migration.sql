-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "subject" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "object" TEXT NOT NULL,
    "qualifier" TEXT,
    "aspect" TEXT,
    "howKnown" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "confidence" INTEGER,
    "reviewRating" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateTable
CREATE TABLE "ClaimSchema" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "alias" TEXT NOT NULL,
    "ceramicId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClaimDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "alias" TEXT NOT NULL,
    "ceramicId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClaimModel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "definitionAlias" TEXT NOT NULL,
    "definitionValue" TEXT NOT NULL,
    "schemaAlias" TEXT NOT NULL,
    "schemaValue" TEXT NOT NULL,
    "claimSchemaId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimModel_claimSchemaId_fkey" FOREIGN KEY ("claimSchemaId") REFERENCES "ClaimSchema" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClaimTile" (
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
    "ceramicId" TEXT NOT NULL,
    "claimSchemaId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClaimTile_claimSchemaId_fkey" FOREIGN KEY ("claimSchemaId") REFERENCES "ClaimSchema" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

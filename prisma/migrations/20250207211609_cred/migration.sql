
-- CreateTable
CREATE TABLE "Credential" (
    "id" SERIAL NOT NULL,
    "context" JSONB,
    "type" JSONB,
    "issuer" JSONB,
    "issuanceDate" TIMESTAMP(3),
    "expirationDate" TIMESTAMP(3),
    "credentialSubject" JSONB,
    "proof" JSONB,
    "sameAs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);



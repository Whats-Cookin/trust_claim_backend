-- CreateTable
CREATE TABLE "credential_offers" (
    "id" SERIAL NOT NULL,
    "credential_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "recipient_name" TEXT,
    "recipient_email" TEXT,
    "issuer_org_uri" TEXT,
    "expires_at" TIMESTAMP(3),
    "claimed_at" TIMESTAMP(3),
    "subject_uri" TEXT,
    "claim_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credential_offers_token_hash_key" ON "credential_offers"("token_hash");

-- CreateIndex
CREATE INDEX "credential_offers_credential_id_idx" ON "credential_offers"("credential_id");

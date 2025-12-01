-- Add CREDENTIAL to EntityType enum
ALTER TYPE "EntityType" ADD VALUE 'CREDENTIAL';

-- Add fields to Credential table
ALTER TABLE "Credential"
ADD COLUMN "canonical_uri" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "credential_schema" TEXT;

-- Create index on canonical_uri
CREATE INDEX "Credential_canonical_uri_idx" ON "Credential"("canonical_uri");

-- Create uri_entities table
CREATE TABLE "uri_entities" (
    "id" SERIAL NOT NULL,
    "uri" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_table" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "thumbnail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uri_entities_pkey" PRIMARY KEY ("id")
);

-- Create unique index on uri
CREATE UNIQUE INDEX "uri_entities_uri_key" ON "uri_entities"("uri");

-- Create indexes for efficient lookups
CREATE INDEX "uri_entities_entity_type_idx" ON "uri_entities"("entity_type");
CREATE INDEX "uri_entities_entity_table_entity_id_idx" ON "uri_entities"("entity_table", "entity_id");

-- Drop ClaimData table
DROP TABLE IF EXISTS "ClaimData";

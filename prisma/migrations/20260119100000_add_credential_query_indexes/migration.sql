-- Add indexes for credential query endpoint
-- These enable efficient filtering and sorting on common query parameters

-- B-tree index on issuanceDate for date filtering and sorting by recent
CREATE INDEX "Credential_issuanceDate_idx" ON "Credential" ("issuanceDate" DESC NULLS LAST);

-- GIN index on type (JSONB array) for contains queries like: type ? 'TalentStampCredential'
CREATE INDEX "Credential_type_idx" ON "Credential" USING GIN (type);

-- GIN index on issuer (JSONB object) for contains queries
CREATE INDEX "Credential_issuer_idx" ON "Credential" USING GIN (issuer);

-- B-tree index on credential_schema for exact match filtering
CREATE INDEX "Credential_credential_schema_idx" ON "Credential" (credential_schema);

-- B-tree index on credentialSubject for GIN queries (e.g., find by subject id)
CREATE INDEX "Credential_credentialSubject_idx" ON "Credential" USING GIN ("credentialSubject");

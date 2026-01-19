-- AddClaimUniqueConstraint
-- Prevents duplicate claims with same (subject, issuerId, claim, sourceURI, statement)
-- Uses LEFT() on statement to stay within 8KB index limit
-- IMPORTANT: Run dedupe_claims.sql BEFORE this migration to clean up existing duplicates!

-- Create unique index with truncated statement (first 500 chars is enough for uniqueness)
CREATE UNIQUE INDEX "Claim_subject_issuerId_claim_sourceURI_statement_key"
ON "Claim" (
  subject,
  COALESCE("issuerId", ''),
  claim,
  COALESCE("sourceURI", ''),
  COALESCE(LEFT(statement, 500), '')
);

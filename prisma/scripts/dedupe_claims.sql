-- DUPLICATE CLAIM CLEANUP SCRIPT
-- Run this BEFORE applying the unique constraint migration
-- This is a DESTRUCTIVE operation - backup the database first!
-- IMPORTANT: Claims are IMMUTABLE - we can only DELETE, never UPDATE
-- IMPORTANT: Claims with images are NEVER deleted
-- IMPORTANT: Claims referenced by other claims are NEVER deleted

BEGIN;

-- Step 1: Identify claims that are referenced by other claims
-- These are claims whose URI appears as subject or object in other claims
CREATE TEMP TABLE referenced_claims AS
SELECT DISTINCT
  CAST(REGEXP_REPLACE(c.subject, '.*/api/claim/([0-9]+)$', '\1') AS INTEGER) as claim_id
FROM "Claim" c
WHERE c.subject ~ '/api/claim/[0-9]+$'
UNION
SELECT DISTINCT
  CAST(REGEXP_REPLACE(c.object, '.*/api/claim/([0-9]+)$', '\1') AS INTEGER) as claim_id
FROM "Claim" c
WHERE c.object IS NOT NULL AND c.object ~ '/api/claim/[0-9]+$';

SELECT 'Found ' || COUNT(*) || ' claims referenced by other claims (protected)' as status FROM referenced_claims;

-- Step 2: Identify duplicate claims
-- Duplicates are defined by: subject + issuerId + claim + sourceURI + statement
-- Priority for keeping: 1) has images, 2) is referenced by other claims, 3) oldest (lowest ID)

CREATE TEMP TABLE duplicate_sets AS
WITH claims_with_images AS (
  SELECT DISTINCT c.id, TRUE as has_images
  FROM "Claim" c
  JOIN "Image" i ON i."claimId" = c.id
),
ranked_claims AS (
  SELECT
    c.id,
    c.subject,
    c."issuerId",
    c.claim,
    c."sourceURI",
    c.statement,
    COALESCE(cwi.has_images, FALSE) as has_images,
    (rc.claim_id IS NOT NULL) as is_referenced,
    ROW_NUMBER() OVER (
      PARTITION BY
        c.subject,
        COALESCE(c."issuerId", ''),
        c.claim,
        COALESCE(c."sourceURI", ''),
        COALESCE(c.statement, '')
      -- Priority: images first, then referenced, then oldest
      ORDER BY
        COALESCE(cwi.has_images, FALSE) DESC,
        (rc.claim_id IS NOT NULL) DESC,
        c.id ASC
    ) as rn,
    FIRST_VALUE(c.id) OVER (
      PARTITION BY
        c.subject,
        COALESCE(c."issuerId", ''),
        c.claim,
        COALESCE(c."sourceURI", ''),
        COALESCE(c.statement, '')
      ORDER BY
        COALESCE(cwi.has_images, FALSE) DESC,
        (rc.claim_id IS NOT NULL) DESC,
        c.id ASC
    ) as keep_id
  FROM "Claim" c
  LEFT JOIN claims_with_images cwi ON cwi.id = c.id
  LEFT JOIN referenced_claims rc ON rc.claim_id = c.id
)
SELECT id as delete_id, keep_id, subject, "issuerId", claim, "sourceURI", statement, has_images, is_referenced
FROM ranked_claims
WHERE rn > 1
  AND has_images = FALSE      -- NEVER delete claims with images
  AND is_referenced = FALSE;  -- NEVER delete claims referenced by other claims

-- Report what we found
SELECT 'Found ' || COUNT(*) || ' duplicate claims to remove (no images, not referenced)' as status FROM duplicate_sets;

-- Report duplicates we're keeping
SELECT 'Keeping duplicates: ' ||
  (SELECT COUNT(*) FROM (
    WITH ranked AS (
      SELECT c.id, ROW_NUMBER() OVER (
        PARTITION BY c.subject, COALESCE(c."issuerId", ''), c.claim, COALESCE(c."sourceURI", ''), COALESCE(c.statement, '')
        ORDER BY c.id
      ) as rn
      FROM "Claim" c
    )
    SELECT id FROM ranked WHERE rn > 1
  ) all_dupes) || ' total duplicates, removing ' ||
  (SELECT COUNT(*) FROM duplicate_sets) || ', keeping ' ||
  ((SELECT COUNT(*) FROM (
    WITH ranked AS (
      SELECT c.id, ROW_NUMBER() OVER (
        PARTITION BY c.subject, COALESCE(c."issuerId", ''), c.claim, COALESCE(c."sourceURI", ''), COALESCE(c.statement, '')
        ORDER BY c.id
      ) as rn
      FROM "Claim" c
    )
    SELECT id FROM ranked WHERE rn > 1
  ) all_dupes) - (SELECT COUNT(*) FROM duplicate_sets)) || ' (have images or are referenced)' as status;

-- Step 3: Get list of edges that will be deleted (for reporting)
CREATE TEMP TABLE edges_to_delete AS
SELECT e.id, e."claimId", e."startNodeId", e."endNodeId", e.label
FROM "Edge" e
WHERE e."claimId" IN (SELECT delete_id FROM duplicate_sets);

SELECT 'Found ' || COUNT(*) || ' edges to delete' as status FROM edges_to_delete;

-- Step 4: Delete edges for duplicate claims
DELETE FROM "Edge"
WHERE "claimId" IN (SELECT delete_id FROM duplicate_sets);

-- Step 5: Delete the duplicate claims
DELETE FROM "Claim"
WHERE id IN (SELECT delete_id FROM duplicate_sets);

-- Step 6: Find orphaned nodes (nodes with no edges pointing to/from them)
CREATE TEMP TABLE orphaned_nodes AS
SELECT n.id, n."nodeUri", n.name
FROM "Node" n
WHERE NOT EXISTS (SELECT 1 FROM "Edge" e WHERE e."startNodeId" = n.id)
  AND NOT EXISTS (SELECT 1 FROM "Edge" e WHERE e."endNodeId" = n.id);

SELECT 'Found ' || COUNT(*) || ' orphaned nodes' as status FROM orphaned_nodes;

-- Step 7: Delete orphaned nodes
DELETE FROM "Node"
WHERE id IN (SELECT id FROM orphaned_nodes);

-- Final Summary
SELECT
  (SELECT COUNT(*) FROM duplicate_sets) as claims_deleted,
  (SELECT COUNT(*) FROM edges_to_delete) as edges_deleted,
  0 as images_deleted,
  (SELECT COUNT(*) FROM orphaned_nodes) as nodes_deleted;

-- Clean up temp tables
DROP TABLE IF EXISTS referenced_claims;
DROP TABLE IF EXISTS duplicate_sets;
DROP TABLE IF EXISTS edges_to_delete;
DROP TABLE IF EXISTS orphaned_nodes;

COMMIT;

-- Migration Script: Prepare for Claims-as-Nodes Refactor
-- This script prepares the database by removing old structure while preserving entity nodes
--
-- IMPORTANT: Run this AFTER schema migration but BEFORE running pipeline

-- Step 1: Safety check - count what will be deleted and what will be kept
SELECT
  'CLAIM nodes to delete' as category,
  COUNT(*) as count
FROM "Node"
WHERE "entType" = 'CLAIM'

UNION ALL

SELECT
  'Entity nodes to KEEP' as category,
  COUNT(*) as count
FROM "Node"
WHERE "entType" != 'CLAIM'

UNION ALL

SELECT
  'Entity nodes with images (PRESERVED)' as category,
  COUNT(*) as count
FROM "Node"
WHERE "entType" != 'CLAIM'
  AND (image IS NOT NULL AND image != '' OR thumbnail IS NOT NULL AND thumbnail != '')

UNION ALL

SELECT
  'Total edges to delete' as category,
  COUNT(*) as count
FROM "Edge";

-- Step 2: Create backup table of claim nodes being deleted (for audit trail)
CREATE TEMP TABLE deleted_claim_nodes AS
SELECT id, "nodeUri", name, "entType", descrip, image, thumbnail
FROM "Node"
WHERE "entType" = 'CLAIM';

SELECT 'Created backup of ' || COUNT(*) || ' claim nodes' as status
FROM deleted_claim_nodes;

-- Step 3: Delete all edges first (due to foreign key constraints)
DELETE FROM "Edge";

SELECT 'Deleted all edges' as status;

-- Step 4: Delete only CLAIM nodes (preserve all entity nodes)
DELETE FROM "Node" WHERE "entType" = 'CLAIM';

SELECT 'Deleted ' || (SELECT COUNT(*) FROM deleted_claim_nodes) || ' claim nodes' as status;

-- Step 5: Verify what remains
SELECT
  '=== VERIFICATION: Remaining nodes ===' as verification_step
UNION ALL
SELECT
  "entType"::text || ': ' || COUNT(*)::text || ' nodes' ||
  ' (' || SUM(CASE WHEN image IS NOT NULL AND image != '' THEN 1 ELSE 0 END)::text || ' with images, ' ||
  SUM(CASE WHEN thumbnail IS NOT NULL AND thumbnail != '' THEN 1 ELSE 0 END)::text || ' with thumbnails)'
FROM "Node"
GROUP BY "entType"
ORDER BY COUNT(*) DESC;

-- Step 6: Verify edge table is empty
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN '✓ Edge table is empty - ready for regeneration'
    ELSE '✗ ERROR: Edge table still has ' || COUNT(*) || ' rows!'
  END as edge_status
FROM "Edge";

-- Step 7: Show sample of preserved entity nodes with images
SELECT 'Sample of preserved entity nodes with images:' as sample_header;

SELECT id, "nodeUri", name, "entType",
       CASE WHEN image IS NOT NULL THEN '✓' ELSE '' END as has_image,
       CASE WHEN thumbnail IS NOT NULL THEN '✓' ELSE '' END as has_thumbnail
FROM "Node"
WHERE (image IS NOT NULL AND image != '') OR (thumbnail IS NOT NULL AND thumbnail != '')
LIMIT 10;

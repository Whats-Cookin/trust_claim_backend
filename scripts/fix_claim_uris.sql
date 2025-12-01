-- One-time fix for invalid URIs in Claim table
-- Only fixes claims where proof is NULL (unsigned claims)
-- Adds https:// to domain-like strings

-- STEP 1: Check what will be fixed (DRY RUN)
SELECT
    id,
    subject as original_subject,
    object as original_object,
    "sourceURI" as original_source,
    CASE
        WHEN subject !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND subject ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}'
        THEN 'https://' || subject
        ELSE subject
    END as fixed_subject,
    CASE
        WHEN object !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND object ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}'
        THEN 'https://' || object
        ELSE object
    END as fixed_object,
    CASE
        WHEN "sourceURI" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND "sourceURI" ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}'
        THEN 'https://' || "sourceURI"
        ELSE "sourceURI"
    END as fixed_source
FROM "Claim"
WHERE proof IS NULL
  AND (
    -- Subject needs fixing (domain-like but no scheme)
    (subject !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND subject ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
    OR
    -- Object needs fixing
    (object IS NOT NULL AND object != '' AND object !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND object ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
    OR
    -- SourceURI needs fixing
    ("sourceURI" IS NOT NULL AND "sourceURI" != '' AND "sourceURI" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND "sourceURI" ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
  )
LIMIT 20;

-- STEP 2: Count how many claims will be updated
SELECT
    COUNT(*) as total_claims_to_fix,
    COUNT(CASE WHEN subject !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND subject ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}' THEN 1 END) as subjects_to_fix,
    COUNT(CASE WHEN object IS NOT NULL AND object != '' AND object !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND object ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}' THEN 1 END) as objects_to_fix,
    COUNT(CASE WHEN "sourceURI" IS NOT NULL AND "sourceURI" != '' AND "sourceURI" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND "sourceURI" ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}' THEN 1 END) as sources_to_fix
FROM "Claim"
WHERE proof IS NULL
  AND (
    (subject !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND subject ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
    OR
    (object IS NOT NULL AND object != '' AND object !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND object ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
    OR
    ("sourceURI" IS NOT NULL AND "sourceURI" != '' AND "sourceURI" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND "sourceURI" ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
  );

-- STEP 3: APPLY THE FIX (uncomment to execute)
-- WARNING: This modifies data! Review the dry run results first.

/*
UPDATE "Claim"
SET
    subject = CASE
        WHEN subject !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND subject ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}'
        THEN 'https://' || subject
        ELSE subject
    END,
    object = CASE
        WHEN object IS NOT NULL AND object != '' AND object !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND object ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}'
        THEN 'https://' || object
        ELSE object
    END,
    "sourceURI" = CASE
        WHEN "sourceURI" IS NOT NULL AND "sourceURI" != '' AND "sourceURI" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND "sourceURI" ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}'
        THEN 'https://' || "sourceURI"
        ELSE "sourceURI"
    END
WHERE proof IS NULL
  AND (
    (subject !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND subject ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
    OR
    (object IS NOT NULL AND object != '' AND object !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND object ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
    OR
    ("sourceURI" IS NOT NULL AND "sourceURI" != '' AND "sourceURI" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:' AND "sourceURI" ~ '^[a-zA-Z0-9]([a-zA-Z0-9-]*\.)+[a-zA-Z]{2,}')
  );
*/

-- STEP 4: Verify the fix
-- Run this after uncommenting and executing Step 3
/*
SELECT
    COUNT(*) as remaining_invalid_uris
FROM "Claim"
WHERE proof IS NULL
  AND (
    (subject !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:')
    OR
    (object IS NOT NULL AND object != '' AND object !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:')
    OR
    ("sourceURI" IS NOT NULL AND "sourceURI" != '' AND "sourceURI" !~ '^[a-zA-Z][a-zA-Z0-9+.-]*:')
  );
*/

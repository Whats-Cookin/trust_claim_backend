-- AddNodeUriUniqueConstraint
-- This migration adds a unique constraint on Node.nodeUri
-- IMPORTANT: Run the dedupe_nodes.sql script BEFORE running this migration!

-- Add unique constraint on nodeUri
-- This will fail if there are duplicate nodeUri values in the table
-- Run dedupe_nodes.sql first to clean up duplicates
ALTER TABLE "Node" ADD CONSTRAINT "Node_nodeUri_key" UNIQUE ("nodeUri");

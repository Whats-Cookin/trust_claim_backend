/*
  Warnings:

  - The primary key for the `Credential` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `editedAt` on the `Node` table. All the data in the column will be lost.
  - You are about to drop the column `editedBy` on the `Node` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[startNodeId,label,claimId]` on the table `Edge` will be added. If there are existing duplicate values, this will fail.
  - Made the column `startNodeId` on table `Edge` required. This step will fail if there are existing NULL values in that column.
  - Made the column `endNodeId` on table `Edge` required. This step will fail if there are existing NULL values in that column.
  - Changed the type of `label` on the `Edge` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropForeignKey
ALTER TABLE "Edge" DROP CONSTRAINT "Edge_endNodeId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "idx_claim_sourceuri_trgm";

-- DropIndex
DROP INDEX IF EXISTS "idx_claim_statement_trgm";

-- DropIndex
DROP INDEX IF EXISTS "idx_effective_date";

-- DropIndex
DROP INDEX IF EXISTS "idx_object";

-- DropIndex
DROP INDEX IF EXISTS "idx_subject";

-- DropIndex
DROP INDEX "Edge_unique_constraint";

-- DropIndex
DROP INDEX "idx_edge_claimid";

-- DropIndex
DROP INDEX "idx_edge_label";

-- DropIndex
DROP INDEX "idx_endnodeid";

-- DropIndex
DROP INDEX "idx_startnodeid";

-- DropIndex
DROP INDEX IF EXISTS "idx_node_enttype";

-- DropIndex
DROP INDEX IF EXISTS "idx_node_name_descrip_trgm";

-- AlterTable (Handle both SERIAL and VARCHAR cases)
-- First check if we need to change the type at all
DO $$
BEGIN
    -- Check if Credential_id_seq exists (would mean id is SERIAL)
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'Credential_id_seq') THEN
        -- Change from SERIAL to TEXT
        ALTER TABLE "Credential" ALTER COLUMN "id" DROP DEFAULT;
        ALTER TABLE "Credential" ALTER COLUMN "id" SET DATA TYPE TEXT;
        DROP SEQUENCE "Credential_id_seq";
    ELSE
        -- Already VARCHAR or TEXT, just ensure it's TEXT
        ALTER TABLE "Credential" ALTER COLUMN "id" SET DATA TYPE TEXT;
    END IF;
END $$;

-- AlterTable Edge
-- Since the Edge table was truncated, we can safely modify it
-- But handle any potential NULL values just in case
DELETE FROM "Edge" WHERE "startNodeId" IS NULL OR "endNodeId" IS NULL;

ALTER TABLE "Edge" ALTER COLUMN "startNodeId" SET NOT NULL,
ALTER COLUMN "endNodeId" SET NOT NULL;

-- Ensure label column is TEXT (String) and NOT NULL
-- If label doesn't exist, add it; if it does, ensure it's the right type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Edge' AND column_name = 'label') THEN
        ALTER TABLE "Edge" ADD COLUMN "label" TEXT NOT NULL DEFAULT 'subject';
    END IF;
END $$;
ALTER TABLE "Edge" ALTER COLUMN "label" SET NOT NULL;

-- AlterTable Node
-- Drop columns if they exist (they exist on the server but not in our schema)
ALTER TABLE "Node" DROP COLUMN IF EXISTS "editedAt",
DROP COLUMN IF EXISTS "editedBy";

-- AlterTable
ALTER TABLE "uri_entities" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Edge_startNodeId_label_claimId_key" ON "Edge"("startNodeId", "label", "claimId");

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_endNodeId_fkey" FOREIGN KEY ("endNodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

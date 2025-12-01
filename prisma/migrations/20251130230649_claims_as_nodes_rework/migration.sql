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
-- CreateEnum
CREATE TYPE "EdgeLabel" AS ENUM ('subject', 'object', 'source');

-- DropForeignKey
ALTER TABLE "Edge" DROP CONSTRAINT "Edge_endNodeId_fkey";

-- DropIndex
DROP INDEX "idx_claim_sourceuri_trgm";

-- DropIndex
DROP INDEX "idx_claim_statement_trgm";

-- DropIndex
DROP INDEX "idx_effective_date";

-- DropIndex
DROP INDEX "idx_object";

-- DropIndex
DROP INDEX "idx_subject";

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
DROP INDEX "idx_node_enttype";

-- DropIndex
DROP INDEX "idx_node_name_descrip_trgm";

-- AlterTable
ALTER TABLE "Credential" DROP CONSTRAINT "Credential_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "Credential_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Credential_id_seq";

-- AlterTable
ALTER TABLE "Edge" ALTER COLUMN "startNodeId" SET NOT NULL,
ALTER COLUMN "endNodeId" SET NOT NULL,
DROP COLUMN "label",
ADD COLUMN     "label" "EdgeLabel" NOT NULL;

-- AlterTable
ALTER TABLE "Node" DROP COLUMN "editedAt",
DROP COLUMN "editedBy";

-- AlterTable
ALTER TABLE "uri_entities" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "Edge_startNodeId_label_claimId_key" ON "Edge"("startNodeId", "label", "claimId");

-- AddForeignKey
ALTER TABLE "Edge" ADD CONSTRAINT "Edge_endNodeId_fkey" FOREIGN KEY ("endNodeId") REFERENCES "Node"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

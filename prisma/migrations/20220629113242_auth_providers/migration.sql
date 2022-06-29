-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('PASSWORD', 'GITHUB');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authProviderId" TEXT,
ADD COLUMN     "authType" "AuthType" NOT NULL DEFAULT E'PASSWORD',
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

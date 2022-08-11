-- CreateTable
CREATE TABLE "Edge" (
    "id" SERIAL NOT NULL,
    "source" INTEGER NOT NULL,
    "target" INTEGER NOT NULL,
    "relation" TEXT NOT NULL,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

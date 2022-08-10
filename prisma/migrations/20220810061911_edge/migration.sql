-- CreateTable
CREATE TABLE "Edge" (
    "id" SERIAL NOT NULL,
    "nodeOne" TEXT NOT NULL,
    "nodeOneId" INTEGER NOT NULL,
    "nodeOneType" "NodeType" NOT NULL,
    "nodeTwo" TEXT NOT NULL,
    "nodeTwoId" INTEGER NOT NULL,
    "nodeTwoType" "NodeType" NOT NULL,

    CONSTRAINT "Edge_pkey" PRIMARY KEY ("id")
);

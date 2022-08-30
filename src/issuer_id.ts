import "dotenv/config";
import { prisma } from "./db/prisma";

const updateIssuerIdScript = async () => {
  console.log("Fetching all data");
  const acc: { [key: string]: any } = {};
  const repeatedIds: any[] = [];
  const allClaims = await prisma.claim.findMany({});

  allClaims.forEach((claim) => {
    if (claim.object) {
      if (acc[claim.object]) {
        repeatedIds.push(claim.id);
      } else {
        acc[claim.object] = true;
      }
    }
  });

  const { count } = await prisma.claim.deleteMany({
    where: {
      id: {
        in: repeatedIds,
      },
    },
  });
  console.log(`${count} claim/s deleted.`);

  return;
};

updateIssuerIdScript();

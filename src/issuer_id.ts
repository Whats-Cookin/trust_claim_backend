import "dotenv/config";
import { prisma } from "./db/prisma";
import { Claim } from "prisma/prisma-client";

const updateIssuerIdScript = async () => {
  console.log("Fetching all data");
  const allClaims = await prisma.claim.findMany({});

  const updateClaim = async (claim: Claim) => {
    await prisma.claim.update({
      where: { id: claim.id },
      data: {
        issuerId: `http://trustclaims.whatscookin.us/users/${claim.userId}`,
        issuerIdType: "URL",
      },
    });
  };

  console.log(allClaims);

  await Promise.all(allClaims.map(async (claim) => await updateClaim(claim)));

  console.log("Script running complete");

  return;
};

updateIssuerIdScript();

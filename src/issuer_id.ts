import "dotenv/config";
import { prisma } from "./db/prisma";
import { Claim } from "prisma/prisma-client";
import { writeFile } from "fs";
import path from "path";

const updateIssuerIdScript = async () => {
  console.log("Fetching all data");
  const allClaims = await prisma.claim.findMany({});

  const asJson = JSON.stringify(allClaims);
  const filePath = path.resolve(__dirname, "..", "alldata.json");

  writeFile(filePath, asJson, (err) => {
    if (err) {
      console.log(err);
    }
  });

  return;
};

updateIssuerIdScript();

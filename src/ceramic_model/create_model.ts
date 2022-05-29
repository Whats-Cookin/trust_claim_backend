import "dotenv/config";
import { CeramicClient } from "@ceramicnetwork/http-client";
import { ModelManager } from "@glazed/devtools";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import { fromString } from "uint8arrays";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import claimSchema from "./schemas/claim-model.json";

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function createModel() {
  // The key must be provided as an environment variable
  if (!process.env.DID_KEY) {
    console.error("DID_KEY is needed as environment variable.");
    process.exit(9);
  }
  const key = fromString(process.env.DID_KEY, "base16");
  // Create and authenticate the DID
  const did = new DID({
    provider: new Ed25519Provider(key),
    resolver: getResolver(),
  });
  await did.authenticate();

  // Connect to the local Ceramic node
  // to do move this ceramic url to env variables
  const ceramic = new CeramicClient("http://localhost:7007");
  ceramic.did = did;

  // Create a manager for the model
  const manager = new ModelManager({ ceramic });

  const schemaAlias = "Claim";
  const claimSchemaId = await manager.createSchema(schemaAlias, claimSchema);

  const claimSchemaStored = await prisma.claimSchema.create({
    data: { alias: schemaAlias, ceramicId: claimSchemaId },
  });

  const schemaURL = manager.getSchemaURL(claimSchemaId);
  if (!schemaURL) {
    return;
  }

  const claimDefinitionAlias = "ClaimDefinition";
  // Create the definition using the created schema ID
  const claimDefinitionId = await manager.createDefinition(
    claimDefinitionAlias,
    {
      name: "Claim definition",
      description: "All trust claims are part of the claimSchema.",
      schema: schemaURL,
    }
  );

  await prisma.claimDefinition.create({
    data: {
      alias: claimDefinitionAlias,
      ceramicId: claimDefinitionId,
    },
  });

  // Deploy model to Ceramic node
  const modelAliases = await manager.deploy();
  await prisma.claimModel.create({
    data: {
      definitionAlias: claimDefinitionAlias,
      definitionValue: modelAliases.definitions[claimDefinitionAlias],
      schemaAlias: schemaAlias,
      schemaValue: modelAliases.schemas[schemaAlias],
      claimSchemaId: claimSchemaStored.id,
    },
  });
}

createModel();

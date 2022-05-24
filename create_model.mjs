import { writeFile } from "node:fs/promises";
import { CeramicClient } from "@ceramicnetwork/http-client";
import { ModelManager } from "@glazed/devtools";
import { DID } from "dids";
import { Ed25519Provider } from "key-did-provider-ed25519";
import { getResolver } from "key-did-resolver";
import { fromString } from "uint8arrays";
import claimSchema from "./schemas/claim-model.json";

// The key must be provided as an environment variable
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

const claimSchemaId = await manager.createSchema("Claim", claimSchema);

// Create the definition using the created schema ID
await manager.createDefinition("ClaimDefinition", {
  name: "Claim definition",
  description: "All trust claims are part of the claimSchema.",
  schema: manager.getSchemaURL(claimSchemaId),
});

// Deploy model to Ceramic node
const model = await manager.deploy();
// Write deployed model aliases to JSON file
await writeFile("./model.json", JSON.stringify(model));

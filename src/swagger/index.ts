import { readFileSync } from "node:fs";

import yaml from "yaml";
import { type Router } from "express";
import swaggerUi from "swagger-ui-express";

export function registerSwagger(router: Router) {
  const yamlDoc = readFileSync("../docs/swagger/swagger.yaml", { encoding: "utf-8" });
  const swaggerDocument = yaml.parse(yamlDoc);

  router.use("/docs", swaggerUi.serve);
  router.get("/docs", swaggerUi.setup(swaggerDocument));
}

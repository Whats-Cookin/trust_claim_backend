import { readFileSync } from "node:fs";
import * as path from "path";
import yaml from "yaml";
import { type Router } from "express";
import swaggerUi from "swagger-ui-express";

export function registerSwagger(router: Router) {
  const yamlPath = path.join(__dirname, "../../docs/swagger/swagger.yaml");
  try {
    const yamlDoc = readFileSync(yamlPath, { encoding: "utf-8" });
    const swaggerDocument = yaml.parse(yamlDoc);
    router.use("/docs", swaggerUi.serve);
    router.get("/docs", swaggerUi.setup(swaggerDocument));
  } catch (error) {
    console.error("Error loading Swagger YAML file:", error);
  }
}

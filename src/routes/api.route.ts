import { Router } from "express";
import createError from "http-errors";
import { prisma } from "../db/prisma";

const router = Router();

router.get("/model_aliases", async (req, res, next) => {
  try {
    const models = await prisma.claimModel.findMany({
      orderBy: { createdAt: "desc" },
      take: 1,
      include: {
        schemaRef: true,
      },
    });

    const model = models[0];
    const {
      definitionAlias,
      definitionValue,
      schemaAlias,
      schemaValue,
      schemaRef: { ceramicId: schemaCeramicId },
    } = model;

    const aliases = {
      definitions: { [definitionAlias]: definitionValue },
      schemas: { [schemaAlias]: schemaValue },
      tiles: {},
    };

    res.json({ aliases, schemaCeramicId: schemaCeramicId });
  } catch (err) {
    next(new createError.NotFound());
  }
});

router.post("/claim_tile", async (req, res, next) => {
  try {
    const { schemaCeramicId, tileCeramicId: ceramicId, ...rest } = req.body;
    const schema = await prisma.claimSchema.findFirst({
      where: { ceramicId: schemaCeramicId },
    });

    if (!schema) {
      throw new createError.NotFound();
    }

    const { id: schemaId } = schema;

    const tile = await prisma.claimTile.create({
      data: { claimSchemaId: schemaId, ceramicId, ...rest },
    });

    res.json(tile);
  } catch (err) {
    // to do before passing the error it needs to be checked if has some kind of err status codes attached to it.
    // if not we need to pass a 500 server error
    next(new createError.NotFound());
  }
});
export default router;

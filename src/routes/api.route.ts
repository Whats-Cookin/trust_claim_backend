import { Router } from "express";
import createError from "http-errors";
import { prisma } from "../db/prisma";

const router = Router();

router.post("/claim", async (req, res, next) => {
  try {
    const claim = await prisma.claim.create({
      data: req.body,
    });

    res.status(201).json(claim);
  } catch (err) {
    // to do before passing the error it needs to be checked if has some kind of err status codes attached to it.
    // if not we need to pass a 500 server error
    next(new createError.NotFound());
  }
});

export default router;

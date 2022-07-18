import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPost, claimGet } from "../../controllers";

const router = Router();

router.post("/claim", claimPostValidator, claimPost);
router.get("/claim/:claimId?", claimGet);

export default router;

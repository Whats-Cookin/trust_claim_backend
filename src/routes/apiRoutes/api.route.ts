import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPost } from "../../controllers";

const router = Router();

router.post("/claim", claimPostValidator, claimPost);

export default router;

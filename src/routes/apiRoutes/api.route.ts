import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPost, claimSearch } from "../../controllers";

const router = Router();

router.post("/claim", claimPostValidator, claimPost);
router.get("/claim", claimSearch);

export default router;

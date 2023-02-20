import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPost, claimGet } from "../../controllers";
import { jwtVerify } from "../../middlewares";


const router = Router();

router.post("/claim", jwtVerify, claimPostValidator, claimPost);
router.get("/claim/:claimId?", claimGet);


export default router;

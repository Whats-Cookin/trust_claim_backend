import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPostNormalizer } from "../../middlewares/normalizers";
import { claimPost, claimGet } from "../../controllers";
import { jwtVerify } from "../../middlewares";


const router = Router();

router.post("/claim", jwtVerify, claimPostNormalizer, claimPostValidator, claimPost);
router.get("/claim/:claimId?", claimGet);


export default router;

import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPostNormalizer } from "../../middlewares/normalizers";
import {
  claimPost,
  claimsGet,
  claimsFeed,
  getNodeById,
  searchNodes,
  claimReport,
  getNodeForLoggedInUser,
  claimGetById,
  claimSearch,
} from "../../controllers";
import { jwtVerify } from "../../middlewares";
import { getAllClaims } from "../../controllers/api.controller";

const router = Router();

router.post(
  "/claim",
  jwtVerify,
  claimPostNormalizer,
  claimPostValidator,
  claimPost
);
router.get("/claim/search", claimSearch);
router.get("/claims-all", getAllClaims);
router.get("/claim/:claimId?", claimGetById);
router.get("/claimsfeed", claimsGet);
router.get("/claimsfeed2", claimsFeed);
router.get("/node/search", searchNodes);
router.get("/node/:nodeId?", getNodeById);
router.get("/my-node", getNodeForLoggedInUser);
router.get("/report/:claimId?", claimReport);

export default router;

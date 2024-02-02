import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPostNormalizer } from "../../middlewares/normalizers";
import {
  claimPost,
  claimsGet,
  claimsFeed,
  nodesGet,
  claimReport,
  getNodeForLoggedInUser,
  claimGetById,
  claimSearch
} from "../../controllers";
import { jwtVerify } from "../../middlewares";

const router = Router();

router.post(
  "/claim",
  jwtVerify,
  claimPostNormalizer,
  claimPostValidator,
  claimPost
);
router.get("/claim/search", claimSearch);
router.get("/claim/:claimId?", claimGetById);
router.get("/claimsfeed", claimsGet);
router.get("/claimsfeed2", claimsFeed);
router.get("/node/:nodeId?", nodesGet);
router.get("/my-node", getNodeForLoggedInUser);
router.get("/report/:claimId?", claimReport);

export default router;

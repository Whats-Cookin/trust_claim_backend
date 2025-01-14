import { type RequestHandler, Router } from "express";
import { claimPostNormalizer } from "../../middlewares/normalizers";
import {
  claimPost,
  claimsGet,
  createCredential,
  claimsFeed,
  getNodeById,
  searchNodes,
  claimReport,
  getNodeForLoggedInUser,
  claimGetById,
  claimGraph,
  claimSearch,
  createClaimV2,
} from "../../controllers";
import { jwtVerify } from "../../middlewares";
import { claimsFeedV3, getAllClaims } from "../../controllers/api.controller";
import { claimPostSchema, joiValidator, credentialPostSchema } from "../../middlewares/validators/claim.validator";
import { upload } from "../../middlewares/upload/multer.upload";

const router = Router();
console.log("setting up routes");
router.post("/claim", jwtVerify, claimPostNormalizer, joiValidator(claimPostSchema), claimPost);
router.post("/credential", joiValidator(credentialPostSchema), createCredential);
router.post("/claim/v2", upload as unknown as RequestHandler, jwtVerify, createClaimV2);
router.get("/claim/search", claimSearch);
router.get("/claim/:claimId?", claimGetById);
router.get("/claim_graph/:claimId", claimGraph);
router.get("/claims-all", getAllClaims);
router.get("/claimsfeed", claimsGet);
router.get("/claimsfeed2", claimsFeed);
router.get("/claims/v3", claimsFeedV3);
router.get("/node/search", searchNodes);
router.get("/node/:nodeId?", getNodeById);
router.get("/my-node", getNodeForLoggedInUser);
router.get("/report/:claimId?", claimReport);

export default router;

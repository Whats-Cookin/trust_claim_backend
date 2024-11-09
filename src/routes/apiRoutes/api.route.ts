import { Router } from "express";
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
  createClaimV2,
} from "../../controllers";
import { jwtVerify } from "../../middlewares";
import { getAllClaims } from "../../controllers/api.controller";
import {
  claimPostSchema,
  CreateClaimV2Dto,
  joiValidator,
  zodValidator,
} from "../../middlewares/validators/claim.validator";
import { upload } from "../../middlewares/upload/multer.upload";

const router = Router();

router.post("/claim", jwtVerify, claimPostNormalizer, joiValidator(claimPostSchema), claimPost);
router.post("/claim/v2", upload, jwtVerify, zodValidator(CreateClaimV2Dto), createClaimV2);
router.get("/claim/search", claimSearch);
router.get("/claim/:claimId?", claimGetById);
router.get("/claims-all", getAllClaims);
router.get("/claimsfeed", claimsGet);
router.get("/claimsfeed2", claimsFeed);
router.get("/node/search", searchNodes);
router.get("/node/:nodeId?", getNodeById);
router.get("/my-node", getNodeForLoggedInUser);
router.get("/report/:claimId?", claimReport);

export default router;

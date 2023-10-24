import { Router } from "express";
import { claimPostValidator } from "../../middlewares/validators";
import { claimPostNormalizer } from "../../middlewares/normalizers";
import {
  claimPost,
  claimGet,
  claimsGet,
  claimsFeed,
  nodesGet,
} from "../../controllers";
import { jwtVerify } from "../../middlewares";
import {
  getNodeForLoggedInUser,
  imageHandle,
} from "../../controllers/api.controller";
import multer from "multer";

const router = Router();

const storage = multer.memoryStorage();
const fileSizeLimitInMB = 20;
const upload = multer({
  storage: storage,
  limits: { fileSize: fileSizeLimitInMB * 1024 },
});

router.post(
  "/claim",
  upload.array("images", 5),
  jwtVerify,
  claimPostNormalizer,
  claimPostValidator,
  claimPost
);
router.get("/claim/:claimId?", claimGet);
router.get("/claimsfeed", claimsGet);
router.get("/claimsfeed2", claimsFeed);
router.get("/node/:nodeId?", nodesGet);
router.get("/my-node", getNodeForLoggedInUser);
router.post("/image-upload", imageHandle);

export default router;

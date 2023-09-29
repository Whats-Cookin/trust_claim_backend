// import { Router } from "express";
import express from "express";
import {
  authSignupValidator,
  authRefreshTokenValidator,
  githubAuthValidator,
} from "../../middlewares/validators";
import {
  signup,
  login,
  refreshToken,
  githubAuthenticator,
  sismoVerifier,
} from "../../controllers";

const router = express.Router();

router.post("/signup", authSignupValidator, signup);
router.post("/login", login);
router.post("/refresh_token", authRefreshTokenValidator, refreshToken);
router.post("/github", githubAuthValidator, githubAuthenticator);
router.post("/auth/sismo-verify", sismoVerifier);

export default router;

// import { Router } from "express";
import express from "express";
import {
  authSignupValidator,
  authRefreshTokenValidator,
} from "../../middlewares/validators";
import { signup, login, refreshToken } from "../../controllers";

const router = express.Router();

router.post("/signup", authSignupValidator, signup);
router.post("/login", login);
router.post("/refresh_token", authRefreshTokenValidator, refreshToken);

export default router;

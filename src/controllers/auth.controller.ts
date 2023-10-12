import { Request, Response, NextFunction } from "express";
import { prisma } from "../db/prisma";
import {
  generateJWT,
  passToExpressErrorHandler,
  verifyRefreshToken,
} from "../utils";
import createError from "http-errors";
import bcrypt from "bcryptjs";
import axios from "axios";

export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.log("IN SIGNUP");
  const { email, password } = req.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      throw new createError.Conflict(`User with email '${email}' already exists`);
    }

    if (password.length < 6) {
      throw new createError.BadRequest(`Password should be at least 6 characters long`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { email, passwordHash } });

    // res.status(201).json({ message: "User created" });
    res.status(201).json({ message: "User created successfully" });
  } catch (err: any) {
    // passToExpressErrorHandler(err, next);
    console.error(err);

    const message = err.message || "Internal server error";
    const status = err.status || 500;

    res.status(status).json({ message });
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new createError.Unauthorized("Invalid email/password");
    }

    const { passwordHash } = user;
    if (!passwordHash) {
      throw new createError.Unauthorized("Invalid email/password");
    }

    const isEqual = await bcrypt.compare(password, passwordHash);
    if (!isEqual) {
      throw new createError.Unauthorized("Invalid email/password");
    }

    res.status(200).json({
      accessToken: generateJWT(user.id, email, "access"),
      refreshToken: generateJWT(user.id, email, "refresh"),
    });
  } catch (err: any) {
    passToExpressErrorHandler(err, next);
  }
};

export const refreshToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { refreshToken } = req.body;
  try {
    const { email, userId } = verifyRefreshToken(refreshToken);
    const userIdAsNum = Number(userId);

    res.send({
      accessToken: generateJWT(userIdAsNum, email, "access"),
      refreshToken: generateJWT(userIdAsNum, email, "refresh"),
    });
  } catch (err) {
    passToExpressErrorHandler(err, next);
  }
};

export const githubAuthenticator = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { githubAuthCode } = req.body;

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    const accessTokenUrl = "https://github.com/login/oauth/access_token";
    const { data: tokens } = await axios.post(
      accessTokenUrl,
      {},
      {
        params: {
          client_id: clientId,
          client_secret: clientSecret,
          code: githubAuthCode,
        },
        headers: { Accept: "application/json" },
      }
    );

    const { access_token } = tokens;

    const githubUserInfoUrl = "https://api.github.com/user";
    const { data: userData } = await axios.get(githubUserInfoUrl, {
      headers: { Authorization: `token ${access_token}` },
    });
    const { id: githubId, email, name } = userData;
    const githubIdAsString = String(githubId);

    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { authType: "GITHUB", authProviderId: githubIdAsString },
        ],
      },
    });

    if (
      user &&
      ((email && !user.email) ||
        (user.authType !== "GITHUB" &&
          user.authProviderId !== githubIdAsString))
    ) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          email,
          authType: "GITHUB",
          authProviderId: githubIdAsString,
        },
      });
    }

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: email,
          authType: "GITHUB",
          authProviderId: githubIdAsString,
          name,
        },
      });
    }

    res.status(200).json({
      accessToken: generateJWT(user.id, email, "access"),
      refreshToken: generateJWT(user.id, email, "refresh"),
    });
  } catch (err: any) {
    passToExpressErrorHandler(err, next);
  }
};

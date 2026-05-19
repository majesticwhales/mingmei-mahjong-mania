import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.ts";
import { requireAuth } from "../middleware/require-auth.ts";
import { HttpError } from "../lib/http-error.ts";
import * as authService from "../services/auth-service.ts";

export const authRouter = Router();

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, username, password } = req.body ?? {};
    if (
      typeof email !== "string" ||
      typeof username !== "string" ||
      typeof password !== "string"
    ) {
      throw new HttpError(
        400,
        "validation_error",
        "email, username, and password are required",
      );
    }
    const result = await authService.register(email, username, password);
    res.status(201).json(result);
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== "string" || typeof password !== "string") {
      throw new HttpError(
        400,
        "validation_error",
        "email and password are required",
      );
    }
    const result = await authService.login(email, password);
    res.json(result);
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await authService.getUserById(req.user!.id);
    res.json({ user });
  }),
);

import { Router } from "express";
import { asyncHandler } from "../middleware/async-handler.ts";
import { HttpError } from "../lib/http-error.ts";
import * as authService from "../services/auth-service.ts";

/** POST /register, POST /login — no auth required. */
export const authPublicRouter = Router();

authPublicRouter.post(
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

authPublicRouter.post(
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

/** GET /me — mounted in app.ts as `app.use("/api/auth", requireAuth, authProtectedRouter)`. */
export const authProtectedRouter = Router();

authProtectedRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const me = await authService.getMeForUser(req.user!.id);
    res.json(me);
  }),
);

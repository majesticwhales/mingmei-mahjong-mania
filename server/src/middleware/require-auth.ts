import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../auth/jwt.ts";
import { HttpError } from "../lib/http-error.ts";

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new HttpError(401, "unauthorized", "Missing or invalid Authorization header"));
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    next(new HttpError(401, "unauthorized", "Missing bearer token"));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub };
    next();
  } catch {
    next(new HttpError(401, "unauthorized", "Invalid or expired token"));
  }
}

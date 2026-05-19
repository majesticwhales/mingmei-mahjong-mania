import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/http-error.ts";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: "internal_error",
    message: "Internal server error",
  });
}

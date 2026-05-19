import jwt, { type SignOptions } from "jsonwebtoken";
import type { AccessTokenPayload } from "./types.ts";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Add it to server/.env (see .env.example).",
    );
  }
  return secret;
}

function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN ?? "7d";
}

export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { sub: userId };
  const options: SignOptions = {
    expiresIn: getJwtExpiresIn() as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, getJwtSecret(), options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, getJwtSecret());
  if (typeof decoded !== "object" || decoded === null || !("sub" in decoded)) {
    throw new jwt.JsonWebTokenError("Invalid token payload");
  }
  const sub = decoded.sub;
  if (typeof sub !== "string" || sub.length === 0) {
    throw new jwt.JsonWebTokenError("Invalid token subject");
  }
  return { sub };
}

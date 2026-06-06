import type { User } from "../../wire/auth";

export type AuthState =
  | { status: "unknown" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: User; token: string };

export type AuthAction =
  | { type: "auth/restore"; token: string }
  | { type: "auth/login/success"; user: User; token: string }
  | { type: "auth/logout" }
  | { type: "auth/restore/failed" };

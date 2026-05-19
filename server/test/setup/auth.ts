import { randomUUID } from "node:crypto";
import * as authService from "../../src/services/auth-service.ts";

export function uniqueEmail(): string {
  return `user-${randomUUID()}@test.example`;
}

export function uniqueUsername(): string {
  return `user_${randomUUID().slice(0, 8)}`;
}

export async function registerUser(
  overrides: Partial<{
    email: string;
    username: string;
    password: string;
  }> = {},
) {
  const email = overrides.email ?? uniqueEmail();
  const username = overrides.username ?? uniqueUsername();
  const password = overrides.password ?? "password123";
  return authService.register(email, username, password);
}

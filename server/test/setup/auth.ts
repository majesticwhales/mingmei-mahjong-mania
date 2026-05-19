import { randomUUID } from "node:crypto";
import * as authService from "../../src/services/auth-service.ts";
import type { ApiAgent } from "./http.ts";

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

export async function registerViaApi(agent: ApiAgent) {
  const email = uniqueEmail();
  const password = "password123";
  const res = await agent.post("/api/auth/register").send({
    email,
    username: uniqueUsername(),
    password,
  });
  if (res.status !== 201) {
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    token: res.body.token as string,
    userId: res.body.user.id as string,
    email,
    password,
  };
}

import { randomUUID } from "node:crypto";
import * as authService from "../../src/services/auth-service.ts";
import { User } from "../../src/models/user.ts";
import type { ApiAgent } from "./http.ts";

export async function setUserAdmin(userId: string): Promise<void> {
  await User.update({ role: "admin" }, { where: { id: userId } });
}

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

export async function registerAdminUser(
  overrides: Partial<{
    email: string;
    username: string;
    password: string;
  }> = {},
) {
  const result = await registerUser(overrides);
  await setUserAdmin(result.user.id);
  return result;
}

export async function registerAdminViaApi(agent: ApiAgent) {
  const registered = await registerViaApi(agent);
  await setUserAdmin(registered.userId);
  return registered;
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

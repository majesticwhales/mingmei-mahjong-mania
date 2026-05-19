import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "../../../src/lib/http-error.ts";
import * as authService from "../../../src/services/auth-service.ts";
import { registerUser, uniqueEmail, uniqueUsername } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("auth-service", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("registers a user and returns a token", async () => {
    const email = uniqueEmail();
    const result = await authService.register(email, uniqueUsername(), "password123");

    expect(result.user.email).toBe(email);
    expect(result.token).toBeTruthy();
  });

  it("rejects duplicate email on register", async () => {
    const email = uniqueEmail();
    await registerUser({ email });

    await expect(
      authService.register(email, uniqueUsername(), "password123"),
    ).rejects.toMatchObject({
      status: 409,
      code: "email_taken",
    } satisfies Partial<HttpError>);
  });

  it("logs in with valid credentials", async () => {
    const email = uniqueEmail();
    const password = "password123";
    const registered = await registerUser({ email, password });

    const result = await authService.login(email, password);
    expect(result.user.id).toBe(registered.user.id);
    expect(result.token).toBeTruthy();
  });

  it("rejects invalid credentials", async () => {
    const email = uniqueEmail();
    await registerUser({ email });

    await expect(authService.login(email, "wrong-password")).rejects.toMatchObject({
      status: 401,
      code: "invalid_credentials",
    } satisfies Partial<HttpError>);
  });
});

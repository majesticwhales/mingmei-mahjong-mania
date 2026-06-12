import { beforeEach, describe, expect, it } from "vitest";
import { uniqueEmail, uniqueUsername } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { bearer, getAgent } from "../../setup/http.ts";

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("returns 201 with user and token", async () => {
    const agent = await getAgent();
    const email = uniqueEmail();

    const res = await agent.post("/api/auth/register").send({
      email,
      username: uniqueUsername(),
      password: "password123",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(email);
    expect(res.body.token).toBeTruthy();
  });

  it("returns 409 when email is taken", async () => {
    const agent = await getAgent();
    const email = uniqueEmail();
    const body = {
      email,
      username: uniqueUsername(),
      password: "password123",
    };

    await agent.post("/api/auth/register").send(body);
    const res = await agent.post("/api/auth/register").send({
      ...body,
      username: uniqueUsername(),
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("email_taken");
  });
});

describe("POST /api/auth/login and GET /api/auth/me", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("logs in and returns the current user", async () => {
    const agent = await getAgent();
    const email = uniqueEmail();
    const password = "password123";

    await agent.post("/api/auth/register").send({
      email,
      username: uniqueUsername(),
      password,
    });

    const login = await agent.post("/api/auth/login").send({ email, password });
    expect(login.status).toBe(200);

    const me = await agent.get("/api/auth/me").set(bearer(login.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    expect(me.body.activeGameId).toBeNull();
  });

  it("returns 401 for /me without a token", async () => {
    const agent = await getAgent();
    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});

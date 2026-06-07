import { afterEach, describe, expect, it, vi } from "vitest";
import { restClient, setTokenProvider } from "./restClient";

describe("restClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setTokenProvider(() => null);
  });

  it("injects JWT on authenticated requests", async () => {
    setTokenProvider(() => "test-token");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user: { id: "1", email: "a@b.c", username: "alice", createdAt: "2026-01-01" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await restClient.getMe();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("normalizes API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "validation_error", message: "Bad input" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(restClient.login({ email: "a", password: "b" })).rejects.toMatchObject({
      code: "validation_error",
      message: "Bad input",
      status: 400,
    });
  });
});

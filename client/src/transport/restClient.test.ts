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

  describe("getNodeView", () => {
    it("issues GET /api/games/:id/nodes/:nodeId/view with bearer auth", async () => {
      setTokenProvider(() => "test-token");
      const stub = {
        nodeId: "node-1",
        code: "bay",
        name: "Bay",
        lineIds: [],
        isInterchange: false,
        tiles: [],
        currentChallenge: null,
        availableActions: [],
      };
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify(stub), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const result = await restClient.getNodeView("game-42", "node-1");

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/games/game-42/nodes/node-1/view",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
      expect(result).toEqual(stub);
    });

    it("surfaces 403 forbidden as a typed HttpError", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "forbidden",
            message: "Not a participant of this game",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      );

      await expect(
        restClient.getNodeView("game-42", "node-1"),
      ).rejects.toMatchObject({
        code: "forbidden",
        status: 403,
      });
    });

    it("surfaces 404 node_not_found as a typed HttpError", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "node_not_found",
            message: "Node not on this game's map",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      );

      await expect(
        restClient.getNodeView("game-42", "node-1"),
      ).rejects.toMatchObject({
        code: "node_not_found",
        status: 404,
      });
    });

    it("surfaces 409 game_ended as a typed HttpError", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          JSON.stringify({ error: "game_ended", message: "Game ended" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      );

      await expect(
        restClient.getNodeView("game-42", "node-1"),
      ).rejects.toMatchObject({
        code: "game_ended",
        status: 409,
      });
    });
  });
});

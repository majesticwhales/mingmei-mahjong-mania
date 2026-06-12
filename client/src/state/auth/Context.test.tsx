import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTH_STORAGE_KEY, restClient } from "../../transport/restClient";
import { AuthProvider } from "./Context";

describe("AuthProvider", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("keeps the stored token on restClient while auth is restoring", async () => {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token: "stored-tok" }));
    vi.spyOn(restClient, "getMe").mockImplementation(
      () => new Promise(() => {
        /* never resolves — stay in restoring state */
      }),
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ gameId: "g1", teams: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <AuthProvider>
        <span>child</span>
      </AuthProvider>,
    );

    await waitFor(() => expect(restClient.getMe).toHaveBeenCalled());
    await restClient.getGameSummary("game-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/games/game-1/summary",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer stored-tok",
        }),
      }),
    );
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProjection } from "../../test/fixtures/projection";
import { HttpError } from "../../transport/httpError";
import type { NodeViewDto } from "../../wire/nodeView";
import type { RecentEventDto } from "../../wire/projection";
import { GameContext } from "./Context";
import { useNodeView } from "./useNodeView";

// Phase L §5.4 — `useNodeView` hits `GET /api/games/:id/nodes/:nodeId/view`
// on mount / nodeId-change and re-issues a background refresh on every
// inbound `game.event`. Mock the REST client + socket subscription so
// each test controls the resolution timing.
const getNodeViewMock =
  vi.fn<(gameId: string, nodeId: string) => Promise<NodeViewDto>>();

vi.mock("../../transport/restClient", () => ({
  restClient: {
    getNodeView: (gameId: string, nodeId: string) =>
      getNodeViewMock(gameId, nodeId),
  },
}));

// Capture `game.event` subscribers so we can flush a synthetic event
// from inside the test. Returning a no-op unsubscribe matches the real
// `onSocketEvent` contract (TDD §5.4 — hook owns its own cleanup).
type GameEventHandler = (event: RecentEventDto) => void;
let gameEventHandlers: Set<GameEventHandler>;

vi.mock("../../transport/socketClient", () => ({
  onSocketEvent: vi.fn(
    (event: string, handler: (...args: unknown[]) => void) => {
      if (event === "game.event") {
        gameEventHandlers.add(handler as GameEventHandler);
        return () => {
          gameEventHandlers.delete(handler as GameEventHandler);
        };
      }
      return () => undefined;
    },
  ),
}));

function makeNodeView(overrides: Partial<NodeViewDto> = {}): NodeViewDto {
  return {
    nodeId: "node-1",
    code: "BAY",
    name: "Bay",
    lineIds: ["yellow"],
    isInterchange: false,
    tiles: [],
    currentChallenge: null,
    availableActions: [],
    ...overrides,
  };
}

function makeGameEvent(overrides: Partial<RecentEventDto> = {}): RecentEventDto {
  return {
    sequence: 1,
    type: "CHECK_IN",
    teamCode: "A",
    at: "2026-06-11T18:00:00.000Z",
    nodeCode: "BAY",
    ...overrides,
  };
}

type GameStatus = "active" | "absent" | "loading";

function buildProvider(opts: {
  status?: GameStatus;
  gameId?: string;
  gameTeamId?: string;
} = {}) {
  const { status = "active", gameId = "game-1", gameTeamId = "team-1" } = opts;
  return function Provider({ children }: { children: ReactNode }) {
    const state =
      status === "active"
        ? ({
            status: "active",
            id: gameId,
            gameTeamId,
            projection: makeProjection({ gameId }),
            eventLog: [],
            notifications: [],
          } as const)
        : status === "loading"
          ? ({ status: "loading", id: gameId } as const)
          : ({ status: "absent" } as const);
    return (
      <GameContext.Provider
        value={{
          state,
          joinGame: vi.fn(),
          resyncGame: vi.fn(),
          submitCommand: vi.fn(),
          dismissNotification: vi.fn(),
          leaveGame: vi.fn(),
        }}
      >
        {children}
      </GameContext.Provider>
    );
  };
}

describe("useNodeView", () => {
  beforeEach(() => {
    gameEventHandlers = new Set();
  });

  afterEach(() => {
    getNodeViewMock.mockReset();
  });

  it("short-circuits to the empty resting state when nodeId is null (no fetch)", async () => {
    const { result } = renderHook(() => useNodeView(null), {
      wrapper: buildProvider(),
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(typeof result.current.refresh).toBe("function");
    expect(getNodeViewMock).not.toHaveBeenCalled();
  });

  it("short-circuits when the game state is not active even with a nodeId (no gameId to query)", () => {
    renderHook(() => useNodeView("node-1"), {
      wrapper: buildProvider({ status: "loading" }),
    });
    expect(getNodeViewMock).not.toHaveBeenCalled();
  });

  it("fetches on mount and exposes the resolved NodeViewDto", async () => {
    const view = makeNodeView({ name: "Bay Station" });
    getNodeViewMock.mockResolvedValueOnce(view);

    const { result } = renderHook(() => useNodeView("node-1"), {
      wrapper: buildProvider({ gameId: "game-42" }),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(getNodeViewMock).toHaveBeenCalledWith("game-42", "node-1");

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.data).toEqual(view);
    expect(result.current.error).toBeNull();
  });

  it("re-fetches and clears previous data when nodeId changes", async () => {
    getNodeViewMock
      .mockResolvedValueOnce(makeNodeView({ nodeId: "node-1", name: "First" }))
      .mockResolvedValueOnce(makeNodeView({ nodeId: "node-2", name: "Second" }));

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useNodeView(id),
      {
        wrapper: buildProvider(),
        initialProps: { id: "node-1" },
      },
    );

    await waitFor(() => expect(result.current.data?.name).toBe("First"));

    rerender({ id: "node-2" });
    // Clearing previous data on nodeId change is the contract — a
    // different node is a logically different view, so stale data
    // would mislead the user.
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data?.name).toBe("Second"));
    expect(getNodeViewMock).toHaveBeenNthCalledWith(1, "game-1", "node-1");
    expect(getNodeViewMock).toHaveBeenNthCalledWith(2, "game-1", "node-2");
  });

  it("surfaces fetch errors as HttpError without clobbering the refresh callback", async () => {
    const err = new HttpError("forbidden", "Not a participant", 403);
    getNodeViewMock.mockRejectedValueOnce(err);

    const { result } = renderHook(() => useNodeView("node-1"), {
      wrapper: buildProvider(),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(err);
    expect(result.current.data).toBeNull();
    expect(typeof result.current.refresh).toBe("function");
  });

  it("triggers a background refresh on every inbound game.event (previous data stays rendered)", async () => {
    const initial = makeNodeView({ name: "Initial" });
    getNodeViewMock.mockResolvedValueOnce(initial);

    const { result } = renderHook(() => useNodeView("node-1"), {
      wrapper: buildProvider(),
    });

    await waitFor(() => expect(result.current.data?.name).toBe("Initial"));
    expect(getNodeViewMock).toHaveBeenCalledTimes(1);

    // Refresh fetch hangs so we can observe the in-flight "data stays
    // rendered" window before the new payload lands.
    let resolveRefresh!: (v: NodeViewDto) => void;
    const refreshPromise = new Promise<NodeViewDto>((res) => {
      resolveRefresh = res;
    });
    getNodeViewMock.mockReturnValueOnce(refreshPromise);

    act(() => {
      for (const handler of gameEventHandlers) handler(makeGameEvent());
    });

    expect(result.current.loading).toBe(true);
    // No-flicker contract — old data MUST still be observable while
    // the refresh fetch is in flight (TDD §5.4).
    expect(result.current.data).toEqual(initial);
    expect(getNodeViewMock).toHaveBeenCalledTimes(2);

    const refreshed = makeNodeView({ name: "Refreshed" });
    await act(async () => {
      resolveRefresh(refreshed);
      await refreshPromise;
    });

    await waitFor(() => expect(result.current.data?.name).toBe("Refreshed"));
    expect(result.current.loading).toBe(false);
  });

  it("ignores stale responses when a newer fetch supersedes them (race-safe)", async () => {
    // First fetch hangs; second mount-driven fetch (after nodeId
    // change) resolves immediately. The dangling first response must
    // not overwrite the second's data.
    let resolveStale!: (v: NodeViewDto) => void;
    const stalePromise = new Promise<NodeViewDto>((res) => {
      resolveStale = res;
    });
    const fresh = makeNodeView({ nodeId: "node-2", name: "Fresh" });
    getNodeViewMock
      .mockReturnValueOnce(stalePromise)
      .mockResolvedValueOnce(fresh);

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useNodeView(id),
      {
        wrapper: buildProvider(),
        initialProps: { id: "node-1" },
      },
    );

    rerender({ id: "node-2" });
    await waitFor(() => expect(result.current.data?.name).toBe("Fresh"));

    // Late stale response — should be discarded.
    await act(async () => {
      resolveStale(makeNodeView({ nodeId: "node-1", name: "Stale" }));
      await stalePromise;
    });

    expect(result.current.data?.name).toBe("Fresh");
  });

  it("imperative refresh() re-issues the fetch without clearing prior data", async () => {
    const initial = makeNodeView({ name: "Initial" });
    const updated = makeNodeView({ name: "Updated" });
    getNodeViewMock
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(updated);

    const { result } = renderHook(() => useNodeView("node-1"), {
      wrapper: buildProvider(),
    });
    await waitFor(() => expect(result.current.data?.name).toBe("Initial"));

    act(() => {
      result.current.refresh();
    });
    // refresh() is a background refresh — prior data stays put while
    // the next response lands.
    expect(result.current.data?.name).toBe("Initial");
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.data?.name).toBe("Updated"));
    expect(getNodeViewMock).toHaveBeenCalledTimes(2);
  });

  it("refresh() is a no-op when nodeId is null (and never fires a network request)", () => {
    const { result } = renderHook(() => useNodeView(null), {
      wrapper: buildProvider(),
    });

    act(() => {
      result.current.refresh();
    });

    expect(getNodeViewMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});

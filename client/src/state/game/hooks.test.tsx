import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeProjection } from "../../test/fixtures/projection";
import { GameContext } from "./Context";
import { useClaimWin, useCommandWithGeo, useHandCompleted } from "./hooks";
import type { HandCompletedDto } from "../../wire/projection";

// Phase L: the geo-capture hook depends on `captureGeolocationForCommand`,
// which goes through `navigator.geolocation`. We mock the module so each
// test can dictate whether a sample is returned (resolved object, null
// for capture failure, or a hanging promise to model a timeout).
const captureMock = vi.fn<() => Promise<unknown>>();
vi.mock("../../hooks/useGeolocation", () => ({
  captureGeolocationForCommand: () => captureMock(),
}));

type SubmitCommandFn = (
  commandType: string,
  payload?: Record<string, unknown>,
) => Promise<string>;

function buildProvider(
  submitCommand: SubmitCommandFn,
  handCompleted: HandCompletedDto | null = null,
) {
  return function Provider({ children }: { children: ReactNode }) {
    return (
      <GameContext.Provider
        value={{
          state: {
            status: "active",
            id: "game-1",
            gameTeamId: "team-1",
            projection: makeProjection({ handCompleted }),
            eventLog: [],
            notifications: [],
          },
          joinGame: vi.fn(),
          resyncGame: vi.fn(),
          submitCommand,
          dismissNotification: vi.fn(),
          leaveGame: vi.fn(),
        }}
      >
        {children}
      </GameContext.Provider>
    );
  };
}

describe("useClaimWin", () => {
  beforeEach(() => {
    // Default: geo capture returns null so the existing assertion shape
    // (`{ stationTileId }` without a `geo` key) keeps working. Specific
    // tests below override this when they need a sample present.
    captureMock.mockResolvedValue(null);
  });
  afterEach(() => {
    captureMock.mockReset();
  });

  it("calls submitCommand with CLAIM_WIN + stationTileId payload (no geo when capture returns null)", async () => {
    const submitCommand = vi.fn<SubmitCommandFn>().mockResolvedValue("cmd-1");
    const { result } = renderHook(() => useClaimWin(), {
      wrapper: buildProvider(submitCommand),
    });

    await result.current("tile-99");

    expect(submitCommand).toHaveBeenCalledWith("CLAIM_WIN", { stationTileId: "tile-99" });
  });

  it("Phase L: merges captured geo onto the CLAIM_WIN payload", async () => {
    const sample = {
      latitude: 43.65,
      longitude: -79.38,
      accuracy: 12,
      capturedAt: "2026-06-10T18:00:00.000Z",
    };
    captureMock.mockResolvedValue(sample);
    const submitCommand = vi.fn<SubmitCommandFn>().mockResolvedValue("cmd-2");
    const { result } = renderHook(() => useClaimWin(), {
      wrapper: buildProvider(submitCommand),
    });

    await result.current("tile-99");

    expect(submitCommand).toHaveBeenCalledWith("CLAIM_WIN", {
      stationTileId: "tile-99",
      geo: sample,
    });
  });
});

describe("useCommandWithGeo", () => {
  beforeEach(() => {
    captureMock.mockResolvedValue(null);
  });
  afterEach(() => {
    captureMock.mockReset();
  });

  it("captures geo and merges it onto the payload before submitting", async () => {
    const sample = {
      latitude: 1,
      longitude: 2,
      accuracy: 3,
      capturedAt: "2026-06-10T18:00:00.000Z",
    };
    captureMock.mockResolvedValue(sample);
    const submitCommand = vi.fn<SubmitCommandFn>().mockResolvedValue("cmd-1");
    const { result } = renderHook(() => useCommandWithGeo("CHECK_IN"), {
      wrapper: buildProvider(submitCommand),
    });

    await result.current({ nodeId: "node-1" });

    expect(submitCommand).toHaveBeenCalledWith("CHECK_IN", {
      nodeId: "node-1",
      geo: sample,
    });
  });

  it("submits without a geo key when capture returns null (permission denied / no geolocation)", async () => {
    captureMock.mockResolvedValue(null);
    const submitCommand = vi.fn<SubmitCommandFn>().mockResolvedValue("cmd-2");
    const { result } = renderHook(() => useCommandWithGeo("CHECK_OUT"), {
      wrapper: buildProvider(submitCommand),
    });

    await result.current({});

    expect(submitCommand).toHaveBeenCalledWith("CHECK_OUT", {});
    const passedPayload = submitCommand.mock.calls[0]![1]!;
    expect(passedPayload).not.toHaveProperty("geo");
  });

  it("defaults the payload to {} when called with no arguments", async () => {
    const sample = {
      latitude: 0,
      longitude: 0,
      accuracy: 0,
      capturedAt: "2026-06-10T18:00:00.000Z",
    };
    captureMock.mockResolvedValue(sample);
    const submitCommand = vi.fn<SubmitCommandFn>().mockResolvedValue("cmd-3");
    const { result } = renderHook(() => useCommandWithGeo("CHECK_OUT"), {
      wrapper: buildProvider(submitCommand),
    });

    await result.current();

    expect(submitCommand).toHaveBeenCalledWith("CHECK_OUT", { geo: sample });
  });

  it("prefers an explicit `geo` already on the payload over the captured sample", async () => {
    // Tests / replay paths can opt out of live capture by passing their
    // own `geo` block. The hook must not silently overwrite that.
    const captured = {
      latitude: 99,
      longitude: 99,
      accuracy: 99,
      capturedAt: "2026-06-10T18:00:00.000Z",
    };
    const explicit = {
      latitude: 1,
      longitude: 2,
      accuracy: 3,
      capturedAt: "2025-01-01T00:00:00.000Z",
    };
    captureMock.mockResolvedValue(captured);
    const submitCommand = vi.fn<SubmitCommandFn>().mockResolvedValue("cmd-4");
    const { result } = renderHook(() => useCommandWithGeo("SWAP_TILE"), {
      wrapper: buildProvider(submitCommand),
    });

    await result.current({
      handTileId: "h",
      stationTileId: "s",
      geo: explicit,
    });

    expect(submitCommand).toHaveBeenCalledWith("SWAP_TILE", {
      handTileId: "h",
      stationTileId: "s",
      geo: explicit,
    });
  });

  it("propagates the underlying submitCommand error (capture itself never throws)", async () => {
    captureMock.mockResolvedValue(null);
    const submitCommand = vi
      .fn<SubmitCommandFn>()
      .mockRejectedValue(new Error("outbox enqueue failed"));
    const { result } = renderHook(() => useCommandWithGeo("CHECK_IN"), {
      wrapper: buildProvider(submitCommand),
    });

    await expect(result.current({ nodeId: "n" })).rejects.toThrow(
      "outbox enqueue failed",
    );
  });
});

describe("useHandCompleted", () => {
  it("returns null when the team hasn't claimed a winning hand", () => {
    const { result } = renderHook(() => useHandCompleted(), {
      wrapper: buildProvider(vi.fn<SubmitCommandFn>(), null),
    });
    expect(result.current).toBeNull();
  });

  it("returns the projection's handCompleted snapshot when present", () => {
    const snapshot: HandCompletedDto = {
      completedAt: "2026-06-10T18:00:00.000Z",
      winningTile: {
        instanceId: "tile-1",
        suit: "pin",
        rank: 5,
        copyIndex: 0,
        displayName: "5 of Pin",
        isRedFive: false,
      },
      winningNodeCode: "TKY",
      winningNodeName: "Tokyo",
      finalHan: 3,
      finalFu: 40,
      finalPoints: 5200,
      finalYaku: [{ name: "Pinfu", han: 1 }],
    };
    const { result } = renderHook(() => useHandCompleted(), {
      wrapper: buildProvider(vi.fn<SubmitCommandFn>(), snapshot),
    });
    expect(result.current).toEqual(snapshot);
  });
});

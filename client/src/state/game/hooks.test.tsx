import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { makeProjection } from "../../test/fixtures/projection";
import { GameContext } from "./Context";
import { useClaimWin, useHandCompleted } from "./hooks";
import type { HandCompletedDto } from "../../wire/projection";

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
  it("calls submitCommand with CLAIM_WIN + stationTileId payload", async () => {
    const submitCommand = vi.fn<SubmitCommandFn>().mockResolvedValue("cmd-1");
    const { result } = renderHook(() => useClaimWin(), {
      wrapper: buildProvider(submitCommand),
    });

    await result.current("tile-99");

    expect(submitCommand).toHaveBeenCalledWith("CLAIM_WIN", { stationTileId: "tile-99" });
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

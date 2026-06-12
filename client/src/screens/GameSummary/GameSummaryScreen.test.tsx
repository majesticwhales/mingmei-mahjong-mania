import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameContext } from "../../state/game/Context";
import { makeProjection } from "../../test/fixtures/projection";
import { restClient } from "../../transport/restClient";
import type {
  GameSummaryDto,
  GameSummaryTeamDto,
  SummaryTileDto,
} from "../../wire/summary";
import { GameSummaryScreen } from "./GameSummaryScreen";

function summaryTile(overrides: Partial<SummaryTileDto>): SummaryTileDto {
  return {
    instanceId: "instance",
    suit: "pin",
    rank: 5,
    copyIndex: 0,
    displayName: "5 of Pin",
    isRedFive: false,
    ...overrides,
  };
}

function team(overrides: Partial<GameSummaryTeamDto>): GameSummaryTeamDto {
  return {
    gameTeamId: "t-default",
    teamCode: "A",
    displayName: "Team A",
    handCompletedAt: null,
    winningTile: null,
    winningNodeCode: null,
    finalHand: [],
    finalHan: 0,
    finalFu: 0,
    finalPoints: 0,
    finalYaku: [],
    isYakuman: false,
    waits: null,
    ...overrides,
  };
}

const baseProjection = makeProjection();

function wrap(node: React.ReactNode, gameTeamId: string | null = "t-mine") {
  const value = {
    state: gameTeamId
      ? {
          status: "active" as const,
          id: "game-1",
          gameTeamId,
          projection: baseProjection,
          eventLog: [],
          notifications: [],
        }
      : { status: "absent" as const },
    joinGame: vi.fn().mockResolvedValue(undefined),
    resyncGame: vi.fn().mockResolvedValue(undefined),
    submitCommand: vi.fn().mockResolvedValue("cmd-1"),
    dismissNotification: vi.fn(),
    leaveGame: vi.fn(),
  };
  return (
    <GameContext.Provider value={value}>
      <MemoryRouter initialEntries={["/games/game-1/summary"]}>
        <Routes>
          <Route path="/games/:id/summary" element={node} />
          <Route path="/games/:id" element={<div>Game map screen</div>} />
          <Route path="/lobbies" element={<div>Lobbies screen</div>} />
        </Routes>
      </MemoryRouter>
    </GameContext.Provider>
  );
}

describe("GameSummaryScreen", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the loading state while the summary is in flight", () => {
    vi.spyOn(restClient, "getGameSummary").mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );
    render(wrap(<GameSummaryScreen />));
    expect(screen.getByText("Loading summary…")).toBeInTheDocument();
  });

  it("renders the scoreboard sorted by points DESC with the winner badge", async () => {
    const summary: GameSummaryDto = {
      gameId: "game-1",
      endedAt: "2026-06-10T18:00:00.000Z",
      endReason: "all_teams_completed",
      winningGameTeamId: "t-mine",
      teams: [
        team({
          gameTeamId: "t-other",
          teamCode: "B",
          displayName: "Team B",
          handCompletedAt: "2026-06-10T17:55:00.000Z",
          winningTile: summaryTile({}),
          winningNodeCode: "OSA",
          finalHand: [summaryTile({})],
          finalHan: 2,
          finalFu: 30,
          finalPoints: 2000,
          finalYaku: [{ name: "Pinfu", han: 1 }],
        }),
        team({
          gameTeamId: "t-mine",
          teamCode: "A",
          displayName: "Team A",
          handCompletedAt: "2026-06-10T17:50:00.000Z",
          winningTile: summaryTile({ rank: 7 }),
          winningNodeCode: "TKY",
          finalHand: [summaryTile({ rank: 7 })],
          finalHan: 5,
          finalFu: 30,
          finalPoints: 8000,
          finalYaku: [{ name: "Riichi", han: 1 }, { name: "Ippatsu", han: 1 }],
        }),
      ],
    };
    vi.spyOn(restClient, "getGameSummary").mockResolvedValue(summary);

    render(wrap(<GameSummaryScreen />));

    await waitFor(() =>
      expect(screen.getByText(/All teams completed their hands/i)).toBeInTheDocument(),
    );

    const teamHeadings = screen.getAllByRole("heading", { level: 3 });
    expect(teamHeadings.map((h) => h.textContent)).toEqual(["Team A", "Team B"]);

    expect(screen.getAllByText(/8,?000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2,?000/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Winner").length).toBeGreaterThan(0);
    expect(screen.getByText("Won at TKY")).toBeInTheDocument();
    expect(screen.getByText("Won at OSA")).toBeInTheDocument();
    expect(screen.getByText("Riichi")).toBeInTheDocument();
  });

  it("links to the read-only map view", async () => {
    const summary: GameSummaryDto = {
      gameId: "game-1",
      endedAt: "2026-06-10T18:00:00.000Z",
      endReason: "timer",
      winningGameTeamId: null,
      teams: [team({})],
    };
    vi.spyOn(restClient, "getGameSummary").mockResolvedValue(summary);

    render(wrap(<GameSummaryScreen />));

    const viewMapLink = await screen.findByRole("link", { name: /view map/i });
    expect(viewMapLink).toHaveAttribute("href", "/games/game-1?view=map");
  });

  it("calls leaveGame and navigates to lobbies when 'Back to lobbies' is clicked", async () => {
    const summary: GameSummaryDto = {
      gameId: "game-1",
      endedAt: "2026-06-10T18:00:00.000Z",
      endReason: "timer",
      winningGameTeamId: null,
      teams: [team({})],
    };
    vi.spyOn(restClient, "getGameSummary").mockResolvedValue(summary);
    const leaveGame = vi.fn();

    render(
      <GameContext.Provider
        value={{
          state: {
            status: "active",
            id: "game-1",
            gameTeamId: "t-default",
            projection: baseProjection,
            eventLog: [],
            notifications: [],
          },
          joinGame: vi.fn(),
          resyncGame: vi.fn(),
          submitCommand: vi.fn(),
          dismissNotification: vi.fn(),
          leaveGame,
        }}
      >
        <MemoryRouter initialEntries={["/games/game-1/summary"]}>
          <Routes>
            <Route path="/games/:id/summary" element={<GameSummaryScreen />} />
            <Route path="/lobbies" element={<div>Lobbies screen</div>} />
          </Routes>
        </MemoryRouter>
      </GameContext.Provider>,
    );

    const backButton = await screen.findByRole("button", { name: /back to lobbies/i });
    await userEvent.click(backButton);

    expect(leaveGame).toHaveBeenCalled();
    expect(screen.getByText("Lobbies screen")).toBeInTheDocument();
  });

  it("renders an error state when the summary fetch fails", async () => {
    const { HttpError } = await import("../../transport/httpError");
    vi.spyOn(restClient, "getGameSummary").mockRejectedValue(
      new HttpError("game_not_ended", "Game is still active", 409),
    );

    render(wrap(<GameSummaryScreen />));

    await waitFor(() =>
      expect(screen.getByText("Game summary unavailable")).toBeInTheDocument(),
    );
    expect(screen.getByText("Game is still active")).toBeInTheDocument();
  });

  it("renders 'No outright winner' when winningGameTeamId is null", async () => {
    const summary: GameSummaryDto = {
      gameId: "game-1",
      endedAt: "2026-06-10T18:00:00.000Z",
      endReason: "timer",
      winningGameTeamId: null,
      teams: [
        team({ gameTeamId: "t-a", teamCode: "A", finalPoints: 3000 }),
        team({ gameTeamId: "t-b", teamCode: "B", finalPoints: 3000 }),
      ],
    };
    vi.spyOn(restClient, "getGameSummary").mockResolvedValue(summary);

    render(wrap(<GameSummaryScreen />));

    await waitFor(() =>
      expect(screen.getByText(/No outright winner/i)).toBeInTheDocument(),
    );
  });
});

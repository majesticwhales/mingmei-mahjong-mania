import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../transport/httpError";
import { restClient } from "../../transport/restClient";
import { AuthContext } from "../../state/auth/Context";
import { ConnectionContext } from "../../state/connection/Context";
import { LobbyProvider } from "../../state/lobby/Context";
import { useLobby } from "../../state/lobby/hooks";
import type { LobbyDetailDto } from "../../wire/lobby";

const lobby: LobbyDetailDto = {
  id: "lobby-1",
  status: "waiting",
  hostUserId: "host",
  gameId: null,
  config: {
    mapTemplateId: "m1",
    gameDurationSeconds: 3600,
    visibilityPhaseIntervalSeconds: 600,
    visibilityPhaseCount: 4,
    slotsPerNode: 1,
    slotUnlockOffsetsSeconds: [0],
    slotMapUnlockOffsetsSeconds: [0],
    deadWallSize: 14,
    teamAssignmentMode: "pick",
    visibilityMode: "both",
    minPlayersToStart: 4,
    defaultStartNodeCode: null,
    configUpdatedAt: null,
  },
  members: [{ userId: "user-1", username: "alice", joinedAt: "2026-01-01", teamSlot: null }],
  readiness: {
    ready: false,
    reasons: ["Need more players"],
    memberCount: 1,
    minPlayersToStart: 4,
    soloStartAllowed: false,
    playersPerTeam: { "1": 0, "2": 0, "3": 0, "4": 0 },
    missingTeams: [1, 2, 3, 4],
    unassignedCount: 1,
  },
  notifications: [],
};

function LobbyLoadProbe({ lobbyId }: { lobbyId: string }) {
  const { state, loadLobby } = useLobby();

  useEffect(() => {
    void loadLobby(lobbyId);
  }, [loadLobby, lobbyId]);

  if (state.status === "ready") return <div>joined:{state.id}</div>;
  if (state.status === "error") return <div>error:{state.error.code}</div>;
  return <div>loading</div>;
}

function renderProbe(lobbyId = "lobby-1") {
  return render(
    <AuthContext.Provider
      value={{
        state: {
          status: "authenticated",
          token: "test-token",
          user: {
            id: "user-1",
            username: "alice",
            email: "a@example.com",
            isAdmin: false,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
        },
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      }}
    >
      <ConnectionContext.Provider value={{ state: { status: "idle" }, retry: vi.fn() }}>
        <LobbyProvider>
          <LobbyLoadProbe lobbyId={lobbyId} />
        </LobbyProvider>
      </ConnectionContext.Provider>
    </AuthContext.Provider>,
  );
}

describe("LobbyRoomScreen auto-join", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto-joins when the first load rejects with forbidden", async () => {
    vi.spyOn(restClient, "getLobby").mockRejectedValue(
      new HttpError("forbidden", "You are not a member of this lobby", 403),
    );
    const joinLobby = vi.spyOn(restClient, "joinLobby").mockResolvedValue({ lobby });

    renderProbe();

    await waitFor(() => {
      expect(joinLobby).toHaveBeenCalledTimes(1);
      expect(joinLobby).toHaveBeenCalledWith("lobby-1");
      expect(screen.getByText("joined:lobby-1")).toBeInTheDocument();
    });
  });

  it("shows a terminal error without retrying auto-join", async () => {
    vi.spyOn(restClient, "getLobby").mockRejectedValue(
      new HttpError("not_found", "Lobby not found", 404),
    );
    const joinLobby = vi.spyOn(restClient, "joinLobby");

    renderProbe();

    await waitFor(() => {
      expect(screen.getByText("error:not_found")).toBeInTheDocument();
    });

    expect(joinLobby).not.toHaveBeenCalled();
  });
});

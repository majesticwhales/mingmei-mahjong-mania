import type { TeamAssignmentMode } from "../../src/models/lobby.ts";
import * as lobbyService from "../../src/services/lobby-service.ts";
import { registerUser } from "./auth.ts";

export interface LobbyPlayersFixture {
  lobbyId: string;
  hostId: string;
  userIds: string[];
}

export async function createLobbyWithFourPlayers(options?: {
  teamAssignmentMode?: TeamAssignmentMode;
  assignTeams?: boolean;
  /**
   * Override the starting station for game start. Pass `null` to make teams
   * start without a current node (useful for testing first CHECK_IN). Omit
   * to fall through to the template's default (`bay` on TTC 2026).
   */
  defaultStartNodeCode?: string | null;
}): Promise<LobbyPlayersFixture> {
  const users = await Promise.all([
    registerUser(),
    registerUser(),
    registerUser(),
    registerUser(),
  ]);

  const hostId = users[0]!.user.id;
  const lobby = await lobbyService.createLobby(hostId, {
    teamAssignmentMode: options?.teamAssignmentMode ?? "pick",
    defaultStartNodeCode: options?.defaultStartNodeCode,
  });

  for (let i = 1; i < 4; i += 1) {
    await lobbyService.joinLobby(lobby.id, users[i]!.user.id);
  }

  if (options?.assignTeams !== false) {
    for (let i = 0; i < 4; i += 1) {
      await lobbyService.pickTeam(lobby.id, users[i]!.user.id, i + 1);
    }
  }

  return {
    lobbyId: lobby.id,
    hostId,
    userIds: users.map((u) => u.user.id),
  };
}

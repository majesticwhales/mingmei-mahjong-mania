import type { LobbyAction, LobbyState } from "./types";

function patchMemberTeam(
  state: Extract<LobbyState, { status: "ready" }>,
  userId: string,
  teamSlot: number | null,
) {
  return {
    ...state,
    lobby: {
      ...state.lobby,
      members: state.lobby.members.map((member) =>
        member.userId === userId ? { ...member, teamSlot } : member,
      ),
    },
  };
}

export function lobbyReducer(state: LobbyState, action: LobbyAction): LobbyState {
  switch (action.type) {
    case "lobby/load":
      return { status: "loading", id: action.id };
    case "lobby/loaded":
      return { status: "ready", id: action.id, lobby: action.lobby };
    case "lobby/updated":
      if (state.status !== "ready" && state.status !== "loading") return state;
      return {
        status: "ready",
        id: action.lobby.id,
        lobby: action.lobby,
      };
    case "lobby/load/failed":
      return { status: "error", id: action.id, error: action.error };
    case "lobby/leave":
      return { status: "absent" };
    case "lobby/team/optimistic":
      if (state.status !== "ready") return state;
      return {
        ...patchMemberTeam(state, action.userId, action.teamSlot),
        previousTeamSlot: action.previousTeamSlot,
      };
    case "lobby/team/rolled-back":
      if (state.status !== "ready" || state.previousTeamSlot === undefined) return state;
      return {
        ...patchMemberTeam(state, action.userId, state.previousTeamSlot),
        previousTeamSlot: undefined,
      };
    default:
      return state;
  }
}

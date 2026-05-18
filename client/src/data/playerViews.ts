export const PLAYER_COUNT = 4;

export type PlayerViewMode =
  | "admin"
  | "player-1"
  | "player-2"
  | "player-3"
  | "player-4";

export const PLAYER_VIEW_OPTIONS: readonly {
  value: PlayerViewMode;
  label: string;
}[] = [
  { value: "admin", label: "Admin" },
  { value: "player-1", label: "Player 1" },
  { value: "player-2", label: "Player 2" },
  { value: "player-3", label: "Player 3" },
  { value: "player-4", label: "Player 4" },
];

export function getPlayerIndex(viewMode: PlayerViewMode): number | null {
  if (viewMode === "admin") return null;
  return Number(viewMode.replace("player-", "")) - 1;
}

export function isAdminView(viewMode: PlayerViewMode) {
  return viewMode === "admin";
}

export function isStationVisibleToView(
  stationIndex: number,
  viewMode: PlayerViewMode,
) {
  const playerIndex = getPlayerIndex(viewMode);
  return playerIndex == null || stationIndex % PLAYER_COUNT === playerIndex;
}

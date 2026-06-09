const DEFAULT_RELAX_LOBBY_START_USERNAMES = ["waterbug", "nobadinohz"];

/**
 * When true, lobbies can start with a single player in development — skips
 * the 4-player / full-team readiness checks. Set DEV_RELAX_LOBBY_START=false
 * in server/.env to restore production rules locally.
 */
export function isDevRelaxLobbyStart(): boolean {
  return (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_RELAX_LOBBY_START !== "false"
  );
}

function relaxLobbyStartUsernames(): Set<string> {
  const raw = process.env.RELAX_LOBBY_START_USERNAMES;
  const names = raw
    ? raw.split(",").map((name) => name.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_RELAX_LOBBY_START_USERNAMES;
  return new Set(names);
}

/** Named production test accounts that may start with fewer than four players. */
export function isRelaxLobbyStartForUsername(
  username: string | null | undefined,
): boolean {
  if (!username) return false;
  return relaxLobbyStartUsernames().has(username.toLowerCase());
}

/** Dev relax flag or an allowlisted host username. */
export function isRelaxLobbyStart(
  hostUsername: string | null | undefined,
): boolean {
  return (
    isDevRelaxLobbyStart() || isRelaxLobbyStartForUsername(hostUsername)
  );
}

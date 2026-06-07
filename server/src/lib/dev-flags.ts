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

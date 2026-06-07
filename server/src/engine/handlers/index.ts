import type { CommandHandler } from "../process-command.ts";
import type { CommandType } from "../types.ts";
import { checkInHandler } from "./check-in.ts";
import { checkOutHandler } from "./check-out.ts";
import { completeChallengeHandler } from "./complete-challenge.ts";
import { forfeitChallengeHandler } from "./forfeit-challenge.ts";
import { startChallengeHandler } from "./start-challenge.ts";
import { swapLocationTilesHandler } from "./swap-location-tiles.ts";
import { swapTileHandler } from "./swap-tile.ts";

/**
 * Built-in command handlers. Imported by `process-command.ts` as the
 * default registry. Tests can pass a custom registry to `processCommand`
 * when exercising the orchestrator in isolation.
 */
export const builtinCommandHandlers: ReadonlyMap<CommandType, CommandHandler> =
  new Map<CommandType, CommandHandler>([
    ["CHECK_IN", checkInHandler],
    ["CHECK_OUT", checkOutHandler],
    ["SWAP_TILE", swapTileHandler],
    ["SWAP_LOCATION_TILES", swapLocationTilesHandler],
    ["START_CHALLENGE", startChallengeHandler],
    ["CHALLENGE_COMPLETED", completeChallengeHandler],
    ["CHALLENGE_FORFEITED", forfeitChallengeHandler],
  ]);

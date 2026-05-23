import type {
  CommandContext,
  CommandHandler,
  CommandResult,
} from "../process-command.ts";
import { HttpError } from "../../lib/http-error.ts";

/**
 * Node-to-node tile swap. Reserved for the challenge phase (Phase H),
 * where challenges like "move tile at station A to station B" will resolve
 * via `ChallengeResolutionService` and call this command type.
 *
 * The mechanical swap shares `swapPlacements` from `tile-swap-service.ts`
 * with `SWAP_TILE`, so the eventual implementation should be a thin
 * validator ("both nodes belong to this game; both have tiles") plus the
 * service call. For now, the handler is a stub so unknown-command failures
 * surface as a clear "not implemented" rather than a 400.
 */
export const swapLocationTilesHandler: CommandHandler = {
  async handle(_ctx: CommandContext): Promise<CommandResult> {
    throw new HttpError(
      501,
      "not_implemented",
      "SWAP_LOCATION_TILES is reserved for the challenge phase (Phase H)",
    );
  },
};

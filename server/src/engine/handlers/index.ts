import type { CommandHandler } from "../process-command.ts";
import type { CommandType } from "../types.ts";
import { checkInHandler } from "./check-in.ts";
import { checkOutHandler } from "./check-out.ts";

/**
 * Built-in command handlers. Imported by `process-command.ts` as the
 * default registry. Tests can pass a custom registry to `processCommand`
 * when exercising the orchestrator in isolation.
 */
export const builtinCommandHandlers: ReadonlyMap<CommandType, CommandHandler> =
  new Map<CommandType, CommandHandler>([
    ["CHECK_IN", checkInHandler],
    ["CHECK_OUT", checkOutHandler],
  ]);

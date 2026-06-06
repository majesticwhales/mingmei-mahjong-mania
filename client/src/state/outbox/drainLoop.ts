import { emitCommand } from "../../transport/socketClient";
import { restClient } from "../../transport/restClient";
import type { OutboxRow } from "../../transport/commandOutbox";
import { HttpError } from "../../transport/httpError";

const TERMINAL_CODES = new Set([
  "validation_error",
  "forbidden",
  "invalid_payload",
  "unknown_command",
  "game_not_active",
  "slot_locked",
  "client_command_id_conflict",
  "unauthenticated",
  "not_checked_in",
  "already_at_node",
  "node_not_in_game",
]);

function isRetriable(error: HttpError) {
  if (error.code === "duplicate") return false;
  if (TERMINAL_CODES.has(error.code)) return false;
  if (error.status >= 400 && error.status < 500 && error.code !== "duplicate") {
    return !TERMINAL_CODES.has(error.code);
  }
  return true;
}

function backoffMs(attempts: number) {
  return Math.min(2 ** attempts * 500, 10_000);
}

export async function drainRow(row: OutboxRow, socketConnected: boolean) {
  if (socketConnected) {
    return emitCommand({
      gameId: row.gameId,
      gameTeamId: row.gameTeamId,
      commandType: row.commandType,
      payload: row.payload,
      clientCommandId: row.clientCommandId,
    });
  }
  return restClient.submitCommand(row.gameId, {
    gameTeamId: row.gameTeamId,
    commandType: row.commandType,
    payload: row.payload,
    clientCommandId: row.clientCommandId,
  });
}

export function classifyError(error: unknown): {
  terminal: boolean;
  code: string;
  message: string;
  conflict?: boolean;
  duplicate?: boolean;
} {
  if (!(error instanceof HttpError)) {
    return { terminal: false, code: "unknown_error", message: "Request failed" };
  }
  if (error.code === "duplicate") {
    return { terminal: true, code: error.code, message: error.message, duplicate: true };
  }
  if (error.code === "client_command_id_conflict") {
    return {
      terminal: true,
      code: error.code,
      message: error.message,
      conflict: true,
    };
  }
  return {
    terminal: !isRetriable(error),
    code: error.code,
    message: error.message,
  };
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { backoffMs };

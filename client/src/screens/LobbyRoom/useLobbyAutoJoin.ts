import { useCallback, useRef } from "react";
import type { HttpError } from "../../transport/httpError";

const RECOVERABLE_MEMBERSHIP_CODES = new Set(["forbidden", "not_a_member"]);

export function isRecoverableMembershipError(error: HttpError): boolean {
  return RECOVERABLE_MEMBERSHIP_CODES.has(error.code);
}

export function lobbyJoinErrorMessage(error: HttpError): string {
  switch (error.code) {
    case "lobby_full":
      return "This lobby is full.";
    case "lobby_closed":
      return "This lobby is closed.";
    case "lobby_already_started":
    case "lobby_not_waiting":
      return "The host already started the game.";
    case "not_found":
      return "Lobby not found. Check the id and try again.";
    default:
      return error.message;
  }
}

export function useAutoJoinAttemptTracker(userId: string | null) {
  const attemptedRef = useRef(new Set<string>());

  const shouldAutoJoin = useCallback(
    (lobbyId: string, error: HttpError): boolean => {
      if (!userId || !isRecoverableMembershipError(error)) return false;
      return !attemptedRef.current.has(`${lobbyId}:${userId}`);
    },
    [userId],
  );

  const markAutoJoinAttempted = useCallback(
    (lobbyId: string) => {
      if (!userId) return;
      attemptedRef.current.add(`${lobbyId}:${userId}`);
    },
    [userId],
  );

  return { shouldAutoJoin, markAutoJoinAttempted };
}

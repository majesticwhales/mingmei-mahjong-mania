import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HttpError } from "../../transport/httpError";
import {
  isRecoverableMembershipError,
  lobbyJoinErrorMessage,
  useAutoJoinAttemptTracker,
} from "./useLobbyAutoJoin";

describe("useLobbyAutoJoin", () => {
  it("treats forbidden and not_a_member as recoverable", () => {
    expect(isRecoverableMembershipError(new HttpError("forbidden", "nope", 403))).toBe(true);
    expect(isRecoverableMembershipError(new HttpError("not_a_member", "nope", 403))).toBe(true);
    expect(isRecoverableMembershipError(new HttpError("not_found", "nope", 404))).toBe(false);
  });

  it("maps terminal lobby errors to friendly copy", () => {
    expect(lobbyJoinErrorMessage(new HttpError("lobby_full", "full", 409))).toBe(
      "This lobby is full.",
    );
    expect(lobbyJoinErrorMessage(new HttpError("lobby_not_waiting", "started", 409))).toBe(
      "The host already started the game.",
    );
  });

  it("auto-joins at most once per lobby and user", () => {
    const { result, rerender } = renderHook(
      ({ userId }) => useAutoJoinAttemptTracker(userId),
      { initialProps: { userId: "user-1" as string | null } },
    );
    const error = new HttpError("forbidden", "nope", 403);

    expect(result.current.shouldAutoJoin("lobby-1", error)).toBe(true);
    result.current.markAutoJoinAttempted("lobby-1");
    expect(result.current.shouldAutoJoin("lobby-1", error)).toBe(false);
    expect(result.current.shouldAutoJoin("lobby-2", error)).toBe(true);

    rerender({ userId: "user-2" });
    expect(result.current.shouldAutoJoin("lobby-1", error)).toBe(true);
  });
});

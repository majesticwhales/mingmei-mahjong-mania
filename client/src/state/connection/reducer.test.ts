import { describe, expect, it } from "vitest";
import { connectionReducer } from "./reducer";

describe("connectionReducer", () => {
  it("transitions to connected", () => {
    expect(
      connectionReducer(
        { status: "connecting", attempt: 1 },
        { type: "conn/connect/succeeded", at: 100 },
      ),
    ).toEqual({ status: "connected", since: 100 });
  });

  it("reaches giving_up", () => {
    expect(
      connectionReducer(
        { status: "reconnecting", attempt: 30, nextAttemptAt: 1 },
        { type: "conn/give-up", reason: "max_retries" },
      ),
    ).toEqual({ status: "giving_up", reason: "max_retries" });
  });
});

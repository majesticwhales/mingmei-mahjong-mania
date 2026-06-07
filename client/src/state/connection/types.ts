export type ConnectionState =
  | { status: "idle" }
  | { status: "connecting"; attempt: number }
  | { status: "connected"; since: number }
  | { status: "disconnected"; reason: string; attempt: number }
  | { status: "reconnecting"; attempt: number; nextAttemptAt: number }
  | { status: "giving_up"; reason: string };

export type ConnectionAction =
  | { type: "conn/connect/started"; attempt: number }
  | { type: "conn/connect/succeeded"; at: number }
  | { type: "conn/disconnect"; reason: string; attempt: number }
  | { type: "conn/reconnect/scheduled"; attempt: number; nextAttemptAt: number }
  | { type: "conn/give-up"; reason: string }
  | { type: "conn/retry-requested" }
  | { type: "conn/reset" };

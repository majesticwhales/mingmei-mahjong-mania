import type { OutboxRow } from "../../transport/commandOutbox";

export interface OutboxState {
  byGame: Record<string, OutboxRow[]>;
  draining: boolean;
  conflictBanner: { gameId: string; clientCommandId: string } | null;
  toasts: Array<{ id: string; message: string }>;
}

export type OutboxAction =
  | { type: "outbox/hydrated"; rows: OutboxRow[] }
  | { type: "outbox/enqueued"; row: OutboxRow }
  | { type: "outbox/in-flight"; clientCommandId: string }
  | { type: "outbox/acked"; clientCommandId: string }
  | { type: "outbox/rejected"; clientCommandId: string; error?: { code: string; message: string }; terminal?: boolean }
  | { type: "outbox/conflict"; gameId: string; clientCommandId: string }
  | { type: "outbox/banner/dismissed" }
  | { type: "outbox/drain/started" }
  | { type: "outbox/drain/finished" }
  | { type: "outbox/toast"; message: string }
  | { type: "outbox/toast/dismiss"; id: string };

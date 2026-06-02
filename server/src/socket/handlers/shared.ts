import { HttpError } from "../../lib/http-error.ts";

/**
 * Shape every C→S socket event ack uses. `ok: true` carries the
 * handler's typed payload; `ok: false` carries the HTTP-style `code` /
 * `message` pair so clients can switch on `code` without parsing text.
 */
export type Ack<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string };

/**
 * Type of the function Socket.IO passes to the server-side handler for
 * ack-style emits. We type it as `unknown` at the entry point and use
 * `makeAck` to defend against clients that emit without a callback.
 */
type RawAck = (response: unknown) => void;

/**
 * Wrap a possibly-missing ack arg in a safe responder. Clients can
 * legally emit without a callback; we still want the handler to run
 * to completion (e.g. for its side effects like `socket.join`), we
 * just no-op the reply.
 */
export function makeAck<T>(rawAck: unknown): (response: Ack<T>) => void {
  if (typeof rawAck !== "function") {
    return () => {};
  }
  return (response) => {
    (rawAck as RawAck)(response);
  };
}

/**
 * Convert any thrown value into the standard `{ ok: false, code,
 * message }` ack body. `HttpError` is the expected case (services
 * throw it); anything else is masked behind `internal_error` so we
 * never leak stack traces / internal messages over the wire.
 */
export function toErrorAck(err: unknown): {
  ok: false;
  code: string;
  message: string;
} {
  if (err instanceof HttpError) {
    return { ok: false, code: err.code, message: err.message };
  }
  return { ok: false, code: "internal_error", message: "Internal error" };
}

import http from "node:http";
import type { AddressInfo } from "node:net";
import {
  io as ioClient,
  type Socket as ClientSocket,
} from "socket.io-client";
import {
  createSocketServer,
  type AppSocketServer,
} from "../../src/socket/server.ts";

/**
 * Ephemeral Socket.IO server bound to `127.0.0.1` on an OS-assigned port.
 * One harness per test (`beforeEach` / `afterEach`) so connection state
 * never bleeds across tests; `close()` shuts down both the io server and
 * the underlying http server.
 */
export interface SocketTestHarness {
  io: AppSocketServer;
  port: number;
  url: string;
  close: () => Promise<void>;
}

const HTTP_NOT_FOUND_HANDLER = (
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void => {
  res.statusCode = 404;
  res.end();
};

export async function startSocketTestServer(): Promise<SocketTestHarness> {
  const httpServer = http.createServer(HTTP_NOT_FOUND_HANDLER);
  const io = createSocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = httpServer.address() as AddressInfo;
  const port = address.port;
  const url = `http://127.0.0.1:${port}`;

  return {
    io,
    port,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        io.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      }),
  };
}

export interface ConnectOptions {
  /** JWT sent in `auth.token`. Omit / set empty to test the missing-token path. */
  token?: string;
  /** Per-test override; defaults to 4s. */
  timeoutMs?: number;
}

/**
 * Open a socket.io-client connection against `url`, resolving on
 * `connect` and rejecting on `connect_error`. Reconnection is disabled
 * so a single failed handshake fails the test fast.
 *
 * Returns the connected `ClientSocket` — caller is responsible for
 * `client.disconnect()` (the harness `close()` does **not** disconnect
 * clients, by design, so a single client can outlive multiple harness
 * cycles in more elaborate test flows).
 */
export function connectAuthed(
  url: string,
  options: ConnectOptions = {},
): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const auth: Record<string, string> = {};
    if (options.token != null) {
      auth.token = options.token;
    }
    const client = ioClient(url, {
      auth,
      reconnection: false,
      transports: ["websocket"],
      timeout: options.timeoutMs ?? 4000,
    });
    const cleanup = () => {
      client.off("connect", onConnect);
      client.off("connect_error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve(client);
    };
    const onError = (err: Error) => {
      cleanup();
      client.close();
      reject(err);
    };
    client.once("connect", onConnect);
    client.once("connect_error", onError);
  });
}

/**
 * Emit a C→S event with an ack callback and return the typed response.
 * Rejects with the Socket.IO timeout error if the server doesn't reply
 * within `timeoutMs` (default 4s). The two-arg ack form
 * `(err, response)` is the one socket.io-client uses once `.timeout()`
 * is in play — we always wrap in a timeout so a stuck handler fails the
 * test fast instead of hanging vitest.
 */
export function emitAck<T>(
  client: ClientSocket,
  event: string,
  payload: unknown,
  timeoutMs = 4000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    client
      .timeout(timeoutMs)
      .emit(event, payload, (err: Error | null, response: T) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(response);
      });
  });
}

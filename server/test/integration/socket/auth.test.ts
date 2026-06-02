import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signAccessToken } from "../../../src/auth/jwt.ts";
import {
  connectAuthed,
  startSocketTestServer,
  type SocketTestHarness,
} from "../../setup/socket.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";

describe("Socket.IO handshake auth", () => {
  let harness: SocketTestHarness;

  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
    harness = await startSocketTestServer();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("accepts a valid JWT and parks the user id on socket.data", async () => {
    const { user } = await registerUser();
    const token = signAccessToken(user.id);

    const client = await connectAuthed(harness.url, { token });
    try {
      expect(client.connected).toBe(true);

      const sockets = await harness.io.fetchSockets();
      expect(sockets).toHaveLength(1);
      expect(sockets[0]!.data.userId).toBe(user.id);
    } finally {
      client.disconnect();
    }
  });

  it("rejects connections with no token (connect_error `unauthorized`)", async () => {
    await expect(connectAuthed(harness.url)).rejects.toMatchObject({
      message: "unauthorized",
    });

    const sockets = await harness.io.fetchSockets();
    expect(sockets).toHaveLength(0);
  });

  it("rejects connections with a malformed token (connect_error `unauthorized`)", async () => {
    await expect(
      connectAuthed(harness.url, { token: "not-a-real-jwt" }),
    ).rejects.toMatchObject({ message: "unauthorized" });

    const sockets = await harness.io.fetchSockets();
    expect(sockets).toHaveLength(0);
  });

  it("rejects connections with a token signed by a different secret", async () => {
    const realSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "an-entirely-different-secret-just-for-this-test";
    let foreignToken: string;
    try {
      foreignToken = signAccessToken("00000000-0000-0000-0000-000000000000");
    } finally {
      process.env.JWT_SECRET = realSecret;
    }

    await expect(
      connectAuthed(harness.url, { token: foreignToken }),
    ).rejects.toMatchObject({ message: "unauthorized" });
  });

  it("does not leak the verified user id across two concurrent sockets", async () => {
    const { user: userA } = await registerUser();
    const { user: userB } = await registerUser();
    const tokenA = signAccessToken(userA.id);
    const tokenB = signAccessToken(userB.id);

    const [clientA, clientB] = await Promise.all([
      connectAuthed(harness.url, { token: tokenA }),
      connectAuthed(harness.url, { token: tokenB }),
    ]);
    try {
      const sockets = await harness.io.fetchSockets();
      expect(sockets).toHaveLength(2);
      const seenUserIds = new Set(sockets.map((s) => s.data.userId));
      expect(seenUserIds).toEqual(new Set([userA.id, userB.id]));
    } finally {
      clientA.disconnect();
      clientB.disconnect();
    }
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { PRODUCTION_LOBBY_PRESET } from "../../../src/game/lobby-presets.ts";
import { HttpError } from "../../../src/lib/http-error.ts";
import { Lobby } from "../../../src/models/lobby.ts";
import { LobbyNotification } from "../../../src/models/lobby-notification.ts";
import * as service from "../../../src/services/lobby-notification-service.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";

describe("lobby-notification-service", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("lists notifications in (atSeconds, createdAt) order for any member", async () => {
    const { lobbyId, hostId, userIds } = await createLobbyWithFourPlayers();
    await service.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 600,
      template: "time_warning",
      data: { minutesLeft: 10 },
    });
    await service.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 0,
      template: "game_start",
    });
    await service.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 600,
      template: "second_warning",
    });

    const fromHost = await service.listLobbyNotifications(lobbyId, hostId);
    expect(fromHost.map((n) => n.template)).toEqual([
      "game_start",
      "time_warning",
      "second_warning",
      ...PRODUCTION_LOBBY_PRESET.notifications.map((n) => n.template),
    ]);

    const fromGuest = await service.listLobbyNotifications(
      lobbyId,
      userIds[1]!,
    );
    expect(fromGuest).toHaveLength(3 + PRODUCTION_LOBBY_PRESET.notifications.length);
  });

  it("rejects listing from a non-member", async () => {
    const { lobbyId } = await createLobbyWithFourPlayers();
    const outsider = await registerUser();
    await expect(
      service.listLobbyNotifications(lobbyId, outsider.user.id),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    } satisfies Partial<HttpError>);
  });

  it("adds a notification with normalized template + default null data", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const created = await service.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 0,
      template: "  game_start  ",
    });
    expect(created.template).toBe("game_start");
    expect(created.data).toBeNull();

    const persisted = await LobbyNotification.findByPk(created.id);
    expect(persisted?.lobbyId).toBe(lobbyId);
  });

  it("rejects adding a notification from a non-host", async () => {
    const { lobbyId, userIds } = await createLobbyWithFourPlayers();
    await expect(
      service.addLobbyNotification(lobbyId, userIds[1]!, {
        atSeconds: 0,
        template: "x",
      }),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    } satisfies Partial<HttpError>);
  });

  it("rejects adding when the lobby is no longer waiting", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const lobby = await Lobby.findByPk(lobbyId);
    lobby!.status = "starting";
    await lobby!.save();

    await expect(
      service.addLobbyNotification(lobbyId, hostId, {
        atSeconds: 0,
        template: "x",
      }),
    ).rejects.toMatchObject({
      status: 409,
      code: "lobby_not_waiting",
    } satisfies Partial<HttpError>);
  });

  it("validates atSeconds and template input", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    await expect(
      service.addLobbyNotification(lobbyId, hostId, {
        atSeconds: -1,
        template: "x",
      }),
    ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    await expect(
      service.addLobbyNotification(lobbyId, hostId, {
        atSeconds: 1.5,
        template: "x",
      }),
    ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    await expect(
      service.addLobbyNotification(lobbyId, hostId, {
        atSeconds: 0,
        template: "   ",
      }),
    ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    await expect(
      service.addLobbyNotification(lobbyId, hostId, {
        atSeconds: 0,
        template: "x".repeat(65),
      }),
    ).rejects.toMatchObject({ status: 400, code: "validation_error" });
  });

  it("updates only the fields provided in the patch", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const created = await service.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 60,
      template: "first",
      data: { foo: 1 },
    });

    const updated = await service.updateLobbyNotification(
      lobbyId,
      hostId,
      created.id,
      { template: "renamed" },
    );
    expect(updated.template).toBe("renamed");
    expect(updated.atSeconds).toBe(60);
    expect(updated.data).toEqual({ foo: 1 });

    const cleared = await service.updateLobbyNotification(
      lobbyId,
      hostId,
      created.id,
      { data: null },
    );
    expect(cleared.data).toBeNull();
  });

  it("rejects updating a notification from another lobby", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const { lobbyId: otherLobbyId, hostId: otherHostId } =
      await createLobbyWithFourPlayers();
    const inOther = await service.addLobbyNotification(otherLobbyId, otherHostId, {
      atSeconds: 0,
      template: "x",
    });

    await expect(
      service.updateLobbyNotification(lobbyId, hostId, inOther.id, {
        template: "hijack",
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    } satisfies Partial<HttpError>);
  });

  it("removes a notification and reports 404 on a second remove", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const created = await service.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 0,
      template: "x",
    });

    await service.removeLobbyNotification(lobbyId, hostId, created.id);
    expect(await LobbyNotification.findByPk(created.id)).toBeNull();

    await expect(
      service.removeLobbyNotification(lobbyId, hostId, created.id),
    ).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    } satisfies Partial<HttpError>);
  });

  it("rejects removing from a non-host", async () => {
    const { lobbyId, hostId, userIds } = await createLobbyWithFourPlayers();
    const created = await service.addLobbyNotification(lobbyId, hostId, {
      atSeconds: 0,
      template: "x",
    });

    await expect(
      service.removeLobbyNotification(lobbyId, userIds[1]!, created.id),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    } satisfies Partial<HttpError>);
  });
});

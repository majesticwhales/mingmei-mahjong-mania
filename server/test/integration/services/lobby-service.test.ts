import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "../../../src/lib/http-error.ts";
import * as lobbyService from "../../../src/services/lobby-service.ts";
import { registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";

describe("lobby-service", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("creates a lobby with the template default start station", async () => {
    const host = await registerUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    expect(lobby.hostUserId).toBe(host.user.id);
    expect(lobby.config.defaultStartNodeCode).toBe("bay");
    expect(lobby.readiness.ready).toBe(false);
  });

  it("rejects an invalid default start station on create", async () => {
    const host = await registerUser();
    await expect(
      lobbyService.createLobby(host.user.id, {
        defaultStartNodeCode: "not-a-station",
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);
  });

  it("updates team when a member picks a different slot", async () => {
    const host = await registerUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    await lobbyService.pickTeam(lobby.id, host.user.id, 1);
    const switched = await lobbyService.pickTeam(lobby.id, host.user.id, 3);

    const hostMember = switched.members.find((m) => m.userId === host.user.id);
    expect(hostMember?.teamSlot).toBe(3);
  });

  it("join is idempotent for the same user", async () => {
    const host = await registerUser();
    const guest = await registerUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    await lobbyService.joinLobby(lobby.id, guest.user.id);
    const again = await lobbyService.joinLobby(lobby.id, guest.user.id);

    expect(again.members.filter((m) => m.userId === guest.user.id)).toHaveLength(1);
  });

  it("forbids non-members from viewing the lobby", async () => {
    const host = await registerUser();
    const outsider = await registerUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    await expect(
      lobbyService.getLobbyForUser(lobby.id, outsider.user.id),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    } satisfies Partial<HttpError>);
  });

  it("forbids non-host from updating config", async () => {
    const { lobbyId, hostId, userIds } = await createLobbyWithFourPlayers({
      assignTeams: false,
    });
    const guestId = userIds.find((id) => id !== hostId)!;

    await expect(
      lobbyService.updateConfig(lobbyId, guestId, { gameDurationSeconds: 3600 }),
    ).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    } satisfies Partial<HttpError>);
  });

  it("reports ready when four players have picked distinct teams", async () => {
    const { lobbyId, hostId } = await createLobbyWithFourPlayers();
    const detail = await lobbyService.getLobbyForUser(lobbyId, hostId);
    expect(detail.readiness.ready).toBe(true);
  });

  it("defaults slotsPerNode and visibilityPhaseCount from the template", async () => {
    const host = await registerUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    expect(lobby.config.slotsPerNode).toBe(1);
    expect(lobby.config.visibilityPhaseCount).toBe(4);
  });

  it("accepts host overrides for slotsPerNode and visibilityPhaseCount on create", async () => {
    const host = await registerUser();
    const lobby = await lobbyService.createLobby(host.user.id, {
      slotsPerNode: 3,
      visibilityPhaseCount: 6,
    });

    expect(lobby.config.slotsPerNode).toBe(3);
    expect(lobby.config.visibilityPhaseCount).toBe(6);
  });

  it("rejects non-positive slotsPerNode / visibilityPhaseCount on create", async () => {
    const host = await registerUser();

    await expect(
      lobbyService.createLobby(host.user.id, { slotsPerNode: 0 }),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);

    await expect(
      lobbyService.createLobby(host.user.id, { visibilityPhaseCount: 0 }),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);
  });

  it("host can update slotsPerNode and visibilityPhaseCount via updateConfig", async () => {
    const host = await registerUser();
    const created = await lobbyService.createLobby(host.user.id);

    const updated = await lobbyService.updateConfig(created.id, host.user.id, {
      slotsPerNode: 2,
      visibilityPhaseCount: 5,
    });

    expect(updated.config.slotsPerNode).toBe(2);
    expect(updated.config.visibilityPhaseCount).toBe(5);
  });

  it("rejects non-positive slotsPerNode / visibilityPhaseCount via updateConfig", async () => {
    const host = await registerUser();
    const created = await lobbyService.createLobby(host.user.id);

    await expect(
      lobbyService.updateConfig(created.id, host.user.id, { slotsPerNode: -1 }),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);

    await expect(
      lobbyService.updateConfig(created.id, host.user.id, {
        visibilityPhaseCount: 0,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);
  });

  describe("per-slot rules arrays (chunk 5)", () => {
    it("defaults slotUnlockOffsetsSeconds and slotMapVisible from the template", async () => {
      const host = await registerUser();
      const lobby = await lobbyService.createLobby(host.user.id);

      expect(lobby.config.slotUnlockOffsetsSeconds).toEqual([0]);
      expect(lobby.config.slotMapVisible).toEqual([true]);
    });

    it("accepts host overrides on create when length matches slotsPerNode", async () => {
      const host = await registerUser();
      const lobby = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 3,
        slotUnlockOffsetsSeconds: [0, 300, 900],
        slotMapVisible: [true, false, false],
      });

      expect(lobby.config.slotsPerNode).toBe(3);
      expect(lobby.config.slotUnlockOffsetsSeconds).toEqual([0, 300, 900]);
      expect(lobby.config.slotMapVisible).toEqual([true, false, false]);
    });

    it("rejects on create when arrays mismatch slotsPerNode", async () => {
      const host = await registerUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 3,
          slotUnlockOffsetsSeconds: [0, 300],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects slot 0 with a non-zero offset", async () => {
      const host = await registerUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 2,
          slotUnlockOffsetsSeconds: [60, 0],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects slot 0 with map_visible = false", async () => {
      const host = await registerUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 2,
          slotMapVisible: [false, true],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("host can update both arrays via updateConfig", async () => {
      const host = await registerUser();
      const created = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 2,
      });

      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        {
          slotUnlockOffsetsSeconds: [0, 600],
          slotMapVisible: [true, false],
        },
      );

      expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0, 600]);
      expect(updated.config.slotMapVisible).toEqual([true, false]);
    });

    it("auto-pads arrays with 0 / true when slotsPerNode grows and arrays aren't repatched", async () => {
      const host = await registerUser();
      const created = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 2,
        slotUnlockOffsetsSeconds: [0, 60],
        slotMapVisible: [true, false],
      });

      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        { slotsPerNode: 4 },
      );

      expect(updated.config.slotsPerNode).toBe(4);
      expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0, 60, 0, 0]);
      expect(updated.config.slotMapVisible).toEqual([true, false, true, true]);
    });

    it("auto-truncates arrays when slotsPerNode shrinks and arrays aren't repatched", async () => {
      const host = await registerUser();
      const created = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 3,
        slotUnlockOffsetsSeconds: [0, 60, 120],
      });

      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        { slotsPerNode: 1 },
      );

      expect(updated.config.slotsPerNode).toBe(1);
      expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0]);
    });

    it("rejects update when explicit array length doesn't match resulting slotsPerNode", async () => {
      const host = await registerUser();
      const created = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 2,
      });

      await expect(
        lobbyService.updateConfig(created.id, host.user.id, {
          slotsPerNode: 3,
          slotUnlockOffsetsSeconds: [0, 60], // wrong length
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects negative offset entries on update", async () => {
      const host = await registerUser();
      const created = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 2,
      });

      await expect(
        lobbyService.updateConfig(created.id, host.user.id, {
          slotUnlockOffsetsSeconds: [0, -10],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });
  });

  describe("dead wall (chunk 1)", () => {
    it("defaults deadWallSize from the template (0)", async () => {
      const host = await registerUser();
      const lobby = await lobbyService.createLobby(host.user.id);
      expect(lobby.config.deadWallSize).toBe(0);
    });

    it("accepts a host override on create", async () => {
      const host = await registerUser();
      const lobby = await lobbyService.createLobby(host.user.id, {
        deadWallSize: 14,
      });
      expect(lobby.config.deadWallSize).toBe(14);
    });

    it("rejects a negative deadWallSize on create", async () => {
      const host = await registerUser();
      await expect(
        lobbyService.createLobby(host.user.id, { deadWallSize: -1 }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects a non-integer deadWallSize on create", async () => {
      const host = await registerUser();
      await expect(
        lobbyService.createLobby(host.user.id, { deadWallSize: 1.5 }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("host can update deadWallSize via updateConfig", async () => {
      const host = await registerUser();
      const created = await lobbyService.createLobby(host.user.id);

      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        { deadWallSize: 7 },
      );
      expect(updated.config.deadWallSize).toBe(7);
    });

    it("rejects a negative deadWallSize via updateConfig", async () => {
      const host = await registerUser();
      const created = await lobbyService.createLobby(host.user.id);
      await expect(
        lobbyService.updateConfig(created.id, host.user.id, {
          deadWallSize: -3,
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });
  });
});

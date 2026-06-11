import { beforeEach, describe, expect, it } from "vitest";
import { HttpError } from "../../../src/lib/http-error.ts";
import * as lobbyService from "../../../src/services/lobby-service.ts";
import { registerAdminUser, registerUser } from "../../setup/auth.ts";
import { getSequelize, truncateMutableTables } from "../../setup/db.ts";
import { createLobbyWithFourPlayers } from "../../setup/lobby.ts";

describe("lobby-service", () => {
  beforeEach(async () => {
    await truncateMutableTables(await getSequelize());
  });

  it("creates a lobby with the template default start station", async () => {
    const host = await registerAdminUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    expect(lobby.hostUserId).toBe(host.user.id);
    expect(lobby.config.defaultStartNodeCode).toBe("bay");
    expect(lobby.readiness.ready).toBe(false);
  });

  it("rejects an invalid default start station on create", async () => {
    const host = await registerAdminUser();
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
    const host = await registerAdminUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    await lobbyService.pickTeam(lobby.id, host.user.id, 1);
    const switched = await lobbyService.pickTeam(lobby.id, host.user.id, 3);

    const hostMember = switched.members.find((m) => m.userId === host.user.id);
    expect(hostMember?.teamSlot).toBe(3);
  });

  it("join is idempotent for the same user", async () => {
    const host = await registerAdminUser();
    const guest = await registerUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    await lobbyService.joinLobby(lobby.id, guest.user.id);
    const again = await lobbyService.joinLobby(lobby.id, guest.user.id);

    expect(again.members.filter((m) => m.userId === guest.user.id)).toHaveLength(1);
  });

  it("forbids non-members from viewing the lobby", async () => {
    const host = await registerAdminUser();
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
    const host = await registerAdminUser();
    const lobby = await lobbyService.createLobby(host.user.id);

    expect(lobby.config.slotsPerNode).toBe(3);
    expect(lobby.config.visibilityPhaseCount).toBe(3);
  });

  it("accepts host overrides for slotsPerNode and visibilityPhaseCount on create", async () => {
    const host = await registerAdminUser();
    const lobby = await lobbyService.createLobby(host.user.id, {
      visibilityMode: "both",
      slotsPerNode: 3,
      visibilityPhaseCount: 6,
    });

    expect(lobby.config.slotsPerNode).toBe(3);
    expect(lobby.config.visibilityPhaseCount).toBe(6);
  });

  it("rejects non-positive slotsPerNode / visibilityPhaseCount on create", async () => {
    const host = await registerAdminUser();

    await expect(
      lobbyService.createLobby(host.user.id, { slotsPerNode: 0 }),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);

    await expect(
      lobbyService.createLobby(host.user.id, {
        visibilityMode: "both",
        visibilityPhaseCount: 0,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
    } satisfies Partial<HttpError>);
  });

  it("host can update slotsPerNode and visibilityPhaseCount via updateConfig", async () => {
    const host = await registerAdminUser();
    const created = await lobbyService.createLobby(host.user.id);

    const updated = await lobbyService.updateConfig(created.id, host.user.id, {
      visibilityMode: "both",
      slotsPerNode: 2,
      visibilityPhaseCount: 5,
    });

    expect(updated.config.slotsPerNode).toBe(2);
    expect(updated.config.visibilityPhaseCount).toBe(5);
  });

  it("rejects non-positive slotsPerNode / visibilityPhaseCount via updateConfig", async () => {
    const host = await registerAdminUser();
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

  describe("per-slot rules arrays (chunk 5 + Phase L)", () => {
    it("defaults slotUnlockOffsetsSeconds and slotMapUnlockOffsetsSeconds from the template", async () => {
      const host = await registerAdminUser();
      const lobby = await lobbyService.createLobby(host.user.id);

      expect(lobby.config.slotUnlockOffsetsSeconds).toEqual([0, 2400, 4800]);
      // TTC 2026 Phase L map-reveal defaults; see migration
      // `20260611120000-add-slot-map-unlock-offsets.cjs`.
      expect(lobby.config.slotMapUnlockOffsetsSeconds).toEqual([0, 3600, 7200]);
    });

    it("accepts host overrides on create when length matches slotsPerNode", async () => {
      const host = await registerAdminUser();
      const lobby = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 3,
        slotUnlockOffsetsSeconds: [0, 300, 900],
        // Tier-3 example: slot 2 is claimable at 300s but only on the map
        // after 1200s; slot 1 is never on the map.
        slotMapUnlockOffsetsSeconds: [0, null, 1200],
      });

      expect(lobby.config.slotsPerNode).toBe(3);
      expect(lobby.config.slotUnlockOffsetsSeconds).toEqual([0, 300, 900]);
      expect(lobby.config.slotMapUnlockOffsetsSeconds).toEqual([0, null, 1200]);
    });

    it("rejects on create when arrays mismatch slotsPerNode", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 3,
          slotUnlockOffsetsSeconds: [0, 300],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects slot 0 with a non-zero offset", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 2,
          slotUnlockOffsetsSeconds: [60, 0],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects slot 0 with non-zero slotMapUnlockOffsetsSeconds", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 2,
          slotMapUnlockOffsetsSeconds: [60, 60],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects slot 0 with a null slotMapUnlockOffsetsSeconds", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 2,
          slotMapUnlockOffsetsSeconds: [null, 60],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects slotMapUnlockOffsetsSeconds[k] < slotUnlockOffsetsSeconds[k]", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          slotsPerNode: 2,
          slotUnlockOffsetsSeconds: [0, 600],
          // Map offset would reveal at 300s but claim isn't until 600s —
          // the engine can't "claim before reveal" intuitively, so reject.
          slotMapUnlockOffsetsSeconds: [0, 300],
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("host can update both arrays via updateConfig", async () => {
      const host = await registerAdminUser();
      const created = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 2,
      });

      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        {
          slotUnlockOffsetsSeconds: [0, 600],
          slotMapUnlockOffsetsSeconds: [0, 900],
        },
      );

      expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0, 600]);
      expect(updated.config.slotMapUnlockOffsetsSeconds).toEqual([0, 900]);
    });

    it("auto-pads arrays with 0 when slotsPerNode grows and arrays aren't repatched", async () => {
      const host = await registerAdminUser();
      const created = await lobbyService.createLobby(host.user.id, {
        slotsPerNode: 2,
        slotUnlockOffsetsSeconds: [0, 60],
        slotMapUnlockOffsetsSeconds: [0, 120],
      });

      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        { slotsPerNode: 4 },
      );

      expect(updated.config.slotsPerNode).toBe(4);
      expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0, 60, 0, 0]);
      expect(updated.config.slotMapUnlockOffsetsSeconds).toEqual([0, 120, 0, 0]);
    });

    it("auto-truncates arrays when slotsPerNode shrinks and arrays aren't repatched", async () => {
      const host = await registerAdminUser();
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
      const host = await registerAdminUser();
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
      const host = await registerAdminUser();
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
    it("defaults deadWallSize from the template (15)", async () => {
      const host = await registerAdminUser();
      const lobby = await lobbyService.createLobby(host.user.id);
      expect(lobby.config.deadWallSize).toBe(15);
    });

    it("accepts a host override on create", async () => {
      const host = await registerAdminUser();
      const lobby = await lobbyService.createLobby(host.user.id, {
        deadWallSize: 14,
      });
      expect(lobby.config.deadWallSize).toBe(14);
    });

    it("rejects a negative deadWallSize on create", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, { deadWallSize: -1 }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("rejects a non-integer deadWallSize on create", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, { deadWallSize: 1.5 }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("host can update deadWallSize via updateConfig", async () => {
      const host = await registerAdminUser();
      const created = await lobbyService.createLobby(host.user.id);

      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        { deadWallSize: 7 },
      );
      expect(updated.config.deadWallSize).toBe(7);
    });

    it("rejects a negative deadWallSize via updateConfig", async () => {
      const host = await registerAdminUser();
      const created = await lobbyService.createLobby(host.user.id);
      await expect(
        lobbyService.updateConfig(created.id, host.user.id, {
          deadWallSize: -3,
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });
  });

  describe("visibility mode (chunk 2)", () => {
    it("defaults to the template's defaultVisibilityMode ('slot')", async () => {
      const host = await registerAdminUser();
      const lobby = await lobbyService.createLobby(host.user.id);
      expect(lobby.config.visibilityMode).toBe("slot");
    });

    it.each(["none", "phase", "slot", "both"] as const)(
      "accepts visibilityMode=%s on create",
      async (mode) => {
        const host = await registerAdminUser();
        const lobby = await lobbyService.createLobby(host.user.id, {
          visibilityMode: mode,
        });
        expect(lobby.config.visibilityMode).toBe(mode);
      },
    );

    it("rejects an unknown visibilityMode on create", async () => {
      const host = await registerAdminUser();
      await expect(
        lobbyService.createLobby(host.user.id, {
          // @ts-expect-error - intentionally bad input for runtime check
          visibilityMode: "bogus",
        }),
      ).rejects.toMatchObject({ status: 400, code: "validation_error" });
    });

    it("host can patch visibilityMode via updateConfig", async () => {
      const host = await registerAdminUser();
      const created = await lobbyService.createLobby(host.user.id);
      const updated = await lobbyService.updateConfig(
        created.id,
        host.user.id,
        { visibilityMode: "slot" },
      );
      expect(updated.config.visibilityMode).toBe("slot");
    });

    describe("knob lock", () => {
      it("rejects visibilityPhaseCount in a patch when mode excludes phase", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "slot",
        });
        await expect(
          lobbyService.updateConfig(created.id, host.user.id, {
            visibilityPhaseCount: 5,
          }),
        ).rejects.toMatchObject({
          status: 400,
          code: "visibility_knob_locked",
        });
      });

      it("rejects visibilityPhaseIntervalSeconds in a patch when mode excludes phase", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "none",
        });
        await expect(
          lobbyService.updateConfig(created.id, host.user.id, {
            visibilityPhaseIntervalSeconds: 30,
          }),
        ).rejects.toMatchObject({
          status: 400,
          code: "visibility_knob_locked",
        });
      });

      it("rejects non-zero slotUnlockOffsetsSeconds when mode excludes slot", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "phase",
          slotsPerNode: 3,
        });
        await expect(
          lobbyService.updateConfig(created.id, host.user.id, {
            slotUnlockOffsetsSeconds: [0, 60, 0],
          }),
        ).rejects.toMatchObject({
          status: 400,
          code: "visibility_knob_locked",
        });
      });

      it("rejects a null slotMapUnlockOffsetsSeconds entry when mode excludes slot", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "phase",
          slotsPerNode: 2,
        });
        await expect(
          lobbyService.updateConfig(created.id, host.user.id, {
            slotMapUnlockOffsetsSeconds: [0, null],
          }),
        ).rejects.toMatchObject({
          status: 400,
          code: "visibility_knob_locked",
        });
      });

      it("rejects a positive slotMapUnlockOffsetsSeconds entry when mode excludes slot", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "phase",
          slotsPerNode: 2,
        });
        await expect(
          lobbyService.updateConfig(created.id, host.user.id, {
            slotMapUnlockOffsetsSeconds: [0, 60],
          }),
        ).rejects.toMatchObject({
          status: 400,
          code: "visibility_knob_locked",
        });
      });

      it("still allows a trivial slotUnlockOffsetsSeconds (all zeros) when slot is off", async () => {
        // All-zero offsets are a no-op for the slot layer (it's
        // skipped at the engine when off), so the lock lets the host
        // re-send the existing trivial value.
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "phase",
          slotsPerNode: 2,
        });
        const updated = await lobbyService.updateConfig(
          created.id,
          host.user.id,
          { slotUnlockOffsetsSeconds: [0, 0] },
        );
        expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0, 0]);
      });

      it("rejects visibilityPhaseCount on create when visibilityMode excludes phase", async () => {
        const host = await registerAdminUser();
        await expect(
          lobbyService.createLobby(host.user.id, {
            visibilityMode: "slot",
            visibilityPhaseCount: 6,
          }),
        ).rejects.toMatchObject({
          status: 400,
          code: "visibility_knob_locked",
        });
      });
    });

    describe("mode-transition cleanup", () => {
      it("zeros out slot knobs when host switches from `both` to `phase`", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          slotsPerNode: 3,
          slotUnlockOffsetsSeconds: [0, 60, 300],
          slotMapUnlockOffsetsSeconds: [0, null, 600],
        });
        expect(created.config.slotUnlockOffsetsSeconds).toEqual([0, 60, 300]);

        const updated = await lobbyService.updateConfig(
          created.id,
          host.user.id,
          { visibilityMode: "phase" },
        );
        expect(updated.config.visibilityMode).toBe("phase");
        expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0, 0, 0]);
        expect(updated.config.slotMapUnlockOffsetsSeconds).toEqual([0, 0, 0]);
      });

      it("resets phase knobs to template defaults when host switches to `slot`", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "both",
          visibilityPhaseCount: 6,
          visibilityPhaseIntervalSeconds: 30,
        });
        expect(created.config.visibilityPhaseCount).toBe(6);

        const updated = await lobbyService.updateConfig(
          created.id,
          host.user.id,
          { visibilityMode: "slot" },
        );
        expect(updated.config.visibilityMode).toBe("slot");
        // Template default for TTC 2026 is 3.
        expect(updated.config.visibilityPhaseCount).toBe(3);
        expect(updated.config.visibilityPhaseIntervalSeconds).toBeGreaterThan(0);
      });

      it("does not mutate slot knobs when transitioning between two slot-active modes", async () => {
        const host = await registerAdminUser();
        const created = await lobbyService.createLobby(host.user.id, {
          visibilityMode: "both",
          slotsPerNode: 2,
          slotUnlockOffsetsSeconds: [0, 60],
          slotMapUnlockOffsetsSeconds: [0, null],
        });

        const updated = await lobbyService.updateConfig(
          created.id,
          host.user.id,
          { visibilityMode: "slot" },
        );
        expect(updated.config.visibilityMode).toBe("slot");
        expect(updated.config.slotUnlockOffsetsSeconds).toEqual([0, 60]);
        expect(updated.config.slotMapUnlockOffsetsSeconds).toEqual([0, null]);
      });
    });
  });
});

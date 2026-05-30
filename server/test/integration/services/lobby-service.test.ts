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
});

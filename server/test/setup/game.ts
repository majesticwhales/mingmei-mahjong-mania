import type { Transaction } from "sequelize";
import { GAME_TEAM_SLOTS, type GameTeamSlot } from "../../src/services/even-team-assignment.ts";
import { cloneMapTemplateToGame } from "../../src/services/map-clone-service.ts";
import { startFromLobby } from "../../src/services/game-start-service.ts";
import { Game } from "../../src/models/game.ts";
import { GameParticipant } from "../../src/models/game-participant.ts";
import { GameTeam } from "../../src/models/game-team.ts";
import { Lobby } from "../../src/models/lobby.ts";
import { LobbyMember } from "../../src/models/lobby-member.ts";
import { LobbyTeamAssignment } from "../../src/models/lobby-team-assignment.ts";
import { MapTemplate } from "../../src/models/map-template.ts";
import { TeamDefinition } from "../../src/models/team-definition.ts";
import { createLobbyWithFourPlayers } from "./lobby.ts";
import { getSequelize } from "./db.ts";

export interface GameShell {
  gameId: string;
  mapTemplateId: string;
  gameTeamIdBySlot: Map<GameTeamSlot, string>;
  startedAt: Date;
  endsAt: Date;
  visibilityPhaseIntervalSeconds: number;
}

export async function createGameShell(
  lobbyId: string,
  transaction: Transaction,
): Promise<GameShell> {
  const lobby = await Lobby.findByPk(lobbyId, { transaction });
  if (!lobby) {
    throw new Error("Lobby not found");
  }

  const startedAt = new Date();
  const endsAt = new Date(startedAt.getTime() + lobby.gameDurationSeconds * 1000);

  const game = await Game.create(
    {
      lobbyId,
      mapTemplateId: lobby.mapTemplateId,
      status: "active",
      startedAt,
      endsAt,
      durationSeconds: lobby.gameDurationSeconds,
      handSize: 13,
      slotsPerNode: lobby.slotsPerNode,
      visibilityPhase: 0,
      visibilityPhaseCount: lobby.visibilityPhaseCount,
      visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
      configVersion: 1,
    },
    { transaction },
  );

  const definitions = await TeamDefinition.findAll({
    order: [["sortOrder", "ASC"]],
    transaction,
  });
  const gameTeamIdBySlot = new Map<GameTeamSlot, string>();
  for (let slot = 1; slot <= 4; slot += 1) {
    const definition = definitions[slot - 1];
    if (!definition) {
      throw new Error("Expected four team definitions in catalog");
    }
    const team = await GameTeam.create(
      {
        gameId: game.id,
        teamDefinitionId: definition.id,
        displayName: definition.displayName,
      },
      { transaction },
    );
    gameTeamIdBySlot.set(slot as GameTeamSlot, team.id);
  }

  return {
    gameId: game.id,
    mapTemplateId: lobby.mapTemplateId,
    gameTeamIdBySlot,
    startedAt,
    endsAt,
    visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
  };
}

export async function createGameShellWithMap(
  lobbyId: string,
  transaction: Transaction,
): Promise<GameShell & { gameNodeIds: string[] }> {
  const shell = await createGameShell(lobbyId, transaction);
  const cloned = await cloneMapTemplateToGame(
    shell.gameId,
    shell.mapTemplateId,
    transaction,
  );
  return { ...shell, gameNodeIds: cloned.gameNodeIds };
}

export async function withGameShell<T>(
  lobbyId: string,
  fn: (shell: GameShell, transaction: Transaction) => Promise<T>,
): Promise<T> {
  const sequelize = await getSequelize();
  return sequelize.transaction(async (transaction) => {
    const shell = await createGameShell(lobbyId, transaction);
    return fn(shell, transaction);
  });
}

export interface ParticipantFixture {
  userId: string;
  gameTeamId: string;
  teamSlot: GameTeamSlot;
}

export interface StartedGameFixture {
  gameId: string;
  hostUserId: string;
  userIds: string[];
  gameTeamIdBySlot: Map<GameTeamSlot, string>;
  participants: ParticipantFixture[];
}

/**
 * Fully bootstrap a started game (lobby → `startFromLobby`). Returns the
 * mapping from team slot to game-team id so engine tests can address a
 * specific team without re-querying. Pass `defaultStartNodeCode: null` to
 * make teams start unchecked (useful for first-CHECK_IN tests); omit to
 * inherit the template default.
 */
export async function setupStartedGame(
  options: { defaultStartNodeCode?: string | null } = {},
): Promise<StartedGameFixture> {
  const { lobbyId, hostId, userIds } = await createLobbyWithFourPlayers({
    defaultStartNodeCode: options.defaultStartNodeCode,
  });
  const { gameId } = await startFromLobby(lobbyId, hostId);

  const teams = await GameTeam.findAll({
    where: { gameId },
    include: [{ model: TeamDefinition, attributes: ["sortOrder"] }],
  });
  const gameTeamIdBySlot = new Map<GameTeamSlot, string>();
  for (const team of teams) {
    const sortOrder = team.teamDefinition?.sortOrder;
    if (sortOrder == null) {
      throw new Error(`Game team ${team.id} missing team definition sort order`);
    }
    gameTeamIdBySlot.set((sortOrder + 1) as GameTeamSlot, team.id);
  }

  const dbParticipants = await GameParticipant.findAll({ where: { gameId } });
  const participants: ParticipantFixture[] = dbParticipants.map((p) => {
    const slot = [...gameTeamIdBySlot.entries()].find(
      ([, id]) => id === p.gameTeamId,
    )?.[0];
    if (slot == null) {
      throw new Error(`No slot found for participant ${p.id}`);
    }
    return { userId: p.userId, gameTeamId: p.gameTeamId, teamSlot: slot };
  });

  return {
    gameId,
    hostUserId: hostId,
    userIds,
    gameTeamIdBySlot,
    participants,
  };
}

export interface GameShellWithParticipants extends GameShell {
  userIds: string[];
  participants: ParticipantFixture[];
}

/**
 * Light fixture for engine tests: a Game + 4 GameTeams + GameParticipants
 * matching the lobby's team assignments. Skips the map clone and tile deal
 * that `startFromLobby` does, so tests that only need authz + dispatch
 * stay cheap. Requires every lobby member to have a non-null `team_slot`
 * (i.e. lobby was created with `assignTeams: true`).
 */
export async function createGameShellWithParticipants(
  lobbyId: string,
  transaction: Transaction,
): Promise<GameShellWithParticipants> {
  const shell = await createGameShell(lobbyId, transaction);

  const [members, assignments] = await Promise.all([
    LobbyMember.findAll({ where: { lobbyId }, transaction }),
    LobbyTeamAssignment.findAll({ where: { lobbyId }, transaction }),
  ]);
  const slotByUserId = new Map(
    assignments.map((a) => [a.userId, a.teamSlot]),
  );

  const participants: ParticipantFixture[] = [];
  for (const member of members) {
    const slot = slotByUserId.get(member.userId);
    if (slot == null || !GAME_TEAM_SLOTS.includes(slot as GameTeamSlot)) {
      throw new Error(
        `createGameShellWithParticipants requires every lobby member to have a teamSlot (user ${member.userId})`,
      );
    }
    const gameTeamId = shell.gameTeamIdBySlot.get(slot as GameTeamSlot);
    if (!gameTeamId) {
      throw new Error(`Missing game team for slot ${slot}`);
    }
    await GameParticipant.create(
      {
        gameId: shell.gameId,
        userId: member.userId,
        gameTeamId,
      },
      { transaction },
    );
    participants.push({
      userId: member.userId,
      gameTeamId,
      teamSlot: slot as GameTeamSlot,
    });
  }

  return {
    ...shell,
    userIds: members.map((m) => m.userId),
    participants,
  };
}

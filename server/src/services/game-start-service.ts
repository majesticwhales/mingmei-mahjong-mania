import { sequelize } from "../config/database.ts";
import {
  type GameTeamSlot,
  resolveTeamsForGameStart,
} from "./even-team-assignment.ts";
import { cloneMapTemplateToGame } from "./map-clone-service.ts";
import { computeReadiness } from "./lobby-serializer.ts";
import { bootstrapGameVisibility } from "./game-visibility-bootstrap.ts";
import { scheduleGameJobs } from "./game-schedule-service.ts";
import { dealTilesForGame } from "./tile-deal-service.ts";
import { HttpError } from "../lib/http-error.ts";
import { Game } from "../models/game.ts";
import { GameParticipant } from "../models/game-participant.ts";
import { GameTeam } from "../models/game-team.ts";
import { Lobby } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import { MapTemplate } from "../models/map-template.ts";
import { TeamDefinition } from "../models/team-definition.ts";

export interface StartGameResult {
  gameId: string;
  status: "active";
}

/**
 * Creates a full playable game from a ready lobby: teams, map clone, tile deal,
 * visibility bootstrap, and pending scheduled jobs. Job execution is Phase D.
 */
export async function startFromLobby(
  lobbyId: string,
  hostUserId: string,
): Promise<StartGameResult> {
  const lobby = await Lobby.findByPk(lobbyId);
  if (!lobby) {
    throw new HttpError(404, "not_found", "Lobby not found");
  }
  if (lobby.hostUserId !== hostUserId) {
    throw new HttpError(403, "forbidden", "Only the host can start the game");
  }
  if (lobby.status !== "waiting") {
    throw new HttpError(
      409,
      "lobby_not_waiting",
      `Lobby cannot be started (status: ${lobby.status})`,
    );
  }

  const existingGame = await Game.findOne({ where: { lobbyId } });
  if (existingGame) {
    throw new HttpError(409, "game_exists", "This lobby already has a game");
  }

  const [members, teamAssignments, teamDefinitions, mapTemplate] =
    await Promise.all([
      LobbyMember.findAll({ where: { lobbyId } }),
      LobbyTeamAssignment.findAll({ where: { lobbyId } }),
      TeamDefinition.findAll({ order: [["sortOrder", "ASC"]] }),
      MapTemplate.findByPk(lobby.mapTemplateId),
    ]);

  if (!mapTemplate) {
    throw new HttpError(404, "not_found", "Map template not found");
  }
  if (teamDefinitions.length < 4) {
    throw new HttpError(
      500,
      "internal_error",
      "Expected four team definitions in catalog",
    );
  }

  const readiness = computeReadiness(lobby, members, teamAssignments);
  if (!readiness.ready) {
    throw new HttpError(409, "lobby_not_ready", readiness.reasons.join("; "));
  }

  let resolvedTeams: Map<string, GameTeamSlot>;
  try {
    resolvedTeams = resolveTeamsForGameStart(
      lobby.teamAssignmentMode,
      teamAssignments.map((a) => ({
        userId: a.userId,
        teamSlot: a.teamSlot,
      })),
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Team assignment failed";
    throw new HttpError(409, "lobby_not_ready", message);
  }

  const startedAt = new Date();
  const endsAt = new Date(
    startedAt.getTime() + lobby.gameDurationSeconds * 1000,
  );

  const gameId = await sequelize.transaction(async (transaction) => {
    lobby.status = "starting";
    await lobby.save({ transaction });

    for (const assignment of teamAssignments) {
      const slot = resolvedTeams.get(assignment.userId);
      if (slot == null) {
        throw new HttpError(
          500,
          "internal_error",
          `No resolved team for user ${assignment.userId}`,
        );
      }
      assignment.teamSlot = slot;
      await assignment.save({ transaction });
    }

    const game = await Game.create(
      {
        lobbyId,
        mapTemplateId: lobby.mapTemplateId,
        status: "active",
        startedAt,
        endsAt,
        durationSeconds: lobby.gameDurationSeconds,
        handSize: mapTemplate.defaultHandSize,
        slotsPerNode: lobby.slotsPerNode,
        visibilityPhase: 0,
        visibilityPhaseCount: lobby.visibilityPhaseCount,
        visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
        configVersion: 1,
      },
      { transaction },
    );

    await cloneMapTemplateToGame(
      game.id,
      lobby.mapTemplateId,
      transaction,
    );

    const gameTeamIdBySlot = new Map<GameTeamSlot, string>();
    for (let slot = 1; slot <= 4; slot += 1) {
      const definition = teamDefinitions[slot - 1];
      const gameTeam = await GameTeam.create(
        {
          gameId: game.id,
          teamDefinitionId: definition.id,
          displayName: definition.displayName,
        },
        { transaction },
      );
      gameTeamIdBySlot.set(slot as GameTeamSlot, gameTeam.id);
    }

    for (const member of members) {
      const slot = resolvedTeams.get(member.userId);
      if (slot == null) {
        throw new HttpError(
          500,
          "internal_error",
          `No resolved team for member ${member.userId}`,
        );
      }
      const gameTeamId = gameTeamIdBySlot.get(slot);
      if (!gameTeamId) {
        throw new HttpError(500, "internal_error", "Missing game team for slot");
      }
      await GameParticipant.create(
        {
          gameId: game.id,
          userId: member.userId,
          gameTeamId,
        },
        { transaction },
      );
    }

    await dealTilesForGame(
      game.id,
      gameTeamIdBySlot,
      game.slotsPerNode,
      game.handSize,
      transaction,
    );

    await bootstrapGameVisibility(
      game.id,
      gameTeamIdBySlot,
      startedAt,
      lobby.defaultStartNodeCode,
      game.visibilityPhaseCount,
      transaction,
    );

    await scheduleGameJobs(
      game.id,
      startedAt,
      endsAt,
      lobby.visibilityPhaseIntervalSeconds,
      game.visibilityPhaseCount,
      transaction,
    );

    lobby.status = "closed";
    await lobby.save({ transaction });

    return game.id;
  });

  return { gameId, status: "active" };
}

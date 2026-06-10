import { sequelize } from "../config/database.ts";
import { visibilityIncludes } from "../game/visibility-mode.ts";
import {
  type GameTeamSlot,
  resolveTeamsForGameStart,
} from "./even-team-assignment.ts";
import { cloneMapTemplateToGame } from "./map-clone-service.ts";
import { computeReadiness } from "./lobby-serializer.ts";
import {
  bootstrapGameTeamPositionsAndRules,
  bootstrapGameVisibilityGroups,
} from "./game-visibility-bootstrap.ts";
import { bootstrapGameChallenges } from "./game-challenge-bootstrap.ts";
import { scheduleGameJobs } from "./game-schedule-service.ts";
import { dealTilesForGame } from "./tile-deal-service.ts";
import { isRelaxLobbyStart } from "../lib/dev-flags.ts";
import { HttpError } from "../lib/http-error.ts";
import { assertIsAdmin } from "./auth-service.ts";
import { Game } from "../models/game.ts";
import { GameParticipant } from "../models/game-participant.ts";
import { GameTeam } from "../models/game-team.ts";
import { Lobby } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyNotification } from "../models/lobby-notification.ts";
import { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import { MapTemplate } from "../models/map-template.ts";
import { TeamDefinition } from "../models/team-definition.ts";
import { User } from "../models/user.ts";

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
  userId: string,
): Promise<StartGameResult> {
  await assertIsAdmin(userId);

  const lobby = await Lobby.findByPk(lobbyId);
  if (!lobby) {
    throw new HttpError(404, "not_found", "Lobby not found");
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

  const [members, teamAssignments, teamDefinitions, mapTemplate, host] =
    await Promise.all([
      LobbyMember.findAll({ where: { lobbyId } }),
      LobbyTeamAssignment.findAll({ where: { lobbyId } }),
      TeamDefinition.findAll({ order: [["sortOrder", "ASC"]] }),
      MapTemplate.findByPk(lobby.mapTemplateId),
      User.findByPk(lobby.hostUserId),
    ]);
  const relaxLobbyStart = isRelaxLobbyStart(host?.username);

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

  const readiness = computeReadiness(
    lobby,
    members,
    teamAssignments,
    host?.username,
  );
  if (!readiness.ready) {
    throw new HttpError(409, "lobby_not_ready", readiness.reasons.join("; "));
  }

  const assignmentInputs = members.map((member) => {
    const row = teamAssignments.find((a) => a.userId === member.userId);
    const teamSlot =
      row?.teamSlot ??
      (relaxLobbyStart ? 1 : null);
    return { userId: member.userId, teamSlot };
  });

  let resolvedTeams: Map<string, GameTeamSlot>;
  try {
    const mode = relaxLobbyStart ? "pick" : lobby.teamAssignmentMode;
    resolvedTeams = resolveTeamsForGameStart(mode, assignmentInputs);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Team assignment failed";
    throw new HttpError(409, "lobby_not_ready", message);
  }

  const startedAt = new Date();
  const endsAt = new Date(
    startedAt.getTime() + lobby.gameDurationSeconds * 1000,
  );
  // Random round wind for the game's scoring context (1=E, 2=S, 3=W, 4=N).
  const roundWind = 1 + Math.floor(Math.random() * 4);

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
        slotUnlockOffsetsSeconds: lobby.slotUnlockOffsetsSeconds,
        slotMapVisible: lobby.slotMapVisible,
        roundWind,
        deadWallSize: lobby.deadWallSize,
        visibilityMode: lobby.visibilityMode,
        configVersion: 1,
      },
      { transaction },
    );

    const clonedMap = await cloneMapTemplateToGame(
      game.id,
      lobby.mapTemplateId,
      transaction,
    );

    // Per-node challenge queue: snapshot from the template. Honors a
    // node's ordered list; a node with zero challenges leaves
    // `game_node_challenges` empty and bypasses the swap-credit gate
    // in `swap-tile.ts`.
    await bootstrapGameChallenges(
      [...clonedMap.gameNodeIdByTemplateNodeId.keys()],
      clonedMap.gameNodeIdByTemplateNodeId,
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
      { deadWallSize: game.deadWallSize },
    );

    // Phase-only setup runs only when the snapshotted mode includes the
    // phase layer. Position rows + red-five rule flag always run (the
    // engine reads them in every mode).
    if (visibilityIncludes(game.visibilityMode, "phase")) {
      await bootstrapGameVisibilityGroups(
        game.id,
        gameTeamIdBySlot,
        startedAt,
        game.visibilityPhaseCount,
        transaction,
      );
    }
    await bootstrapGameTeamPositionsAndRules(
      game.id,
      gameTeamIdBySlot,
      lobby.defaultStartNodeCode,
      transaction,
    );

    const notifications = await LobbyNotification.findAll({
      where: { lobbyId },
      order: [["atSeconds", "ASC"]],
      transaction,
    });

    await scheduleGameJobs(
      {
        gameId: game.id,
        startedAt,
        endsAt,
        visibilityPhaseIntervalSeconds: lobby.visibilityPhaseIntervalSeconds,
        visibilityPhaseCount: game.visibilityPhaseCount,
        slotUnlockOffsetsSeconds: game.slotUnlockOffsetsSeconds,
        notifications: notifications.map((n) => ({
          atSeconds: n.atSeconds,
          template: n.template,
          data: n.data,
        })),
        visibilityMode: game.visibilityMode,
      },
      transaction,
    );

    lobby.status = "closed";
    await lobby.save({ transaction });

    return game.id;
  });

  return { gameId, status: "active" };
}

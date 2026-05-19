import type { Transaction } from "sequelize";
import type { GameTeamSlot } from "../../src/services/even-team-assignment.ts";
import { cloneMapTemplateToGame } from "../../src/services/map-clone-service.ts";
import { Game } from "../../src/models/game.ts";
import { GameTeam } from "../../src/models/game-team.ts";
import { Lobby } from "../../src/models/lobby.ts";
import { MapTemplate } from "../../src/models/map-template.ts";
import { TeamDefinition } from "../../src/models/team-definition.ts";
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
      visibilityPhase: 0,
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

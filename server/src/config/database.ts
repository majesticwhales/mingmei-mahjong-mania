import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { Game } from "../models/game.ts";
import { GameEdge } from "../models/game-edge.ts";
import { GameNode } from "../models/game-node.ts";
import { GameParticipant } from "../models/game-participant.ts";
import { GameTeam } from "../models/game-team.ts";
import { GameTile } from "../models/game-tile.ts";
import { GameTilePlacement } from "../models/game-tile-placement.ts";
import { Lobby } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import { MapTemplate } from "../models/map-template.ts";
import { MapTemplateEdge } from "../models/map-template-edge.ts";
import { MapTemplateNode } from "../models/map-template-node.ts";
import { TeamDefinition } from "../models/team-definition.ts";
import { TileType } from "../models/tile-type.ts";
import { User } from "../models/user.ts";

export const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: "postgres",
  models: [
    User,
    TeamDefinition,
    MapTemplate,
    MapTemplateNode,
    MapTemplateEdge,
    TileType,
    Lobby,
    LobbyMember,
    LobbyTeamAssignment,
    Game,
    GameTeam,
    GameParticipant,
    GameNode,
    GameEdge,
    GameTile,
    GameTilePlacement,
  ],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});
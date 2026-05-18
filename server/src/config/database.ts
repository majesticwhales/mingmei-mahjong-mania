import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { Game } from "../models/game.ts";
import { GameCommandQueueItem } from "../models/game-command-queue-item.ts";
import { GameEvent } from "../models/game-event.ts";
import { GameScheduledJob } from "../models/game-scheduled-job.ts";
import { GameEdge } from "../models/game-edge.ts";
import { GameNode } from "../models/game-node.ts";
import { GameParticipant } from "../models/game-participant.ts";
import { GameTeam } from "../models/game-team.ts";
import { GameTile } from "../models/game-tile.ts";
import { GameLocationTeamVisibility } from "../models/game-location-team-visibility.ts";
import { GameNodeVisibilityGroup } from "../models/game-node-visibility-group.ts";
import { GameRuleFlag } from "../models/game-rule-flag.ts";
import { GameTeamHomeGroup } from "../models/game-team-home-group.ts";
import { GameTeamPosition } from "../models/game-team-position.ts";
import { GameTilePlacement } from "../models/game-tile-placement.ts";
import { Lobby } from "../models/lobby.ts";
import { LobbyMember } from "../models/lobby-member.ts";
import { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import { MapTemplate } from "../models/map-template.ts";
import { MediaAsset } from "../models/media-asset.ts";
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
    GameTeamPosition,
    GameNodeVisibilityGroup,
    GameTeamHomeGroup,
    GameLocationTeamVisibility,
    GameRuleFlag,
    GameEvent,
    GameCommandQueueItem,
    GameScheduledJob,
    MediaAsset,
  ],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});
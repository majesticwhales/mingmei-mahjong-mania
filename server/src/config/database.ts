import "../env.ts";
import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { Challenge } from "../models/challenge.ts";
import { ChallengeDeck } from "../models/challenge-deck.ts";
import { ChallengeType } from "../models/challenge-type.ts";
import { Game } from "../models/game.ts";
import { GameChallengeInstance } from "../models/game-challenge-instance.ts";
import { GameChallengeSubmission } from "../models/game-challenge-submission.ts";
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
import { LobbyNotification } from "../models/lobby-notification.ts";
import { LobbyTeamAssignment } from "../models/lobby-team-assignment.ts";
import { MapTemplate } from "../models/map-template.ts";
import { MediaAsset } from "../models/media-asset.ts";
import { MapTemplateEdge } from "../models/map-template-edge.ts";
import { MapTemplateLine } from "../models/map-template-line.ts";
import { MapTemplateNode } from "../models/map-template-node.ts";
import { MapTemplateNodeLine } from "../models/map-template-node-line.ts";
import { GameLine } from "../models/game-line.ts";
import { GameNodeChallenge } from "../models/game-node-challenge.ts";
import { GameNodeLine } from "../models/game-node-line.ts";
import { MapTemplateNodeChallenge } from "../models/map-template-node-challenge.ts";
import { TeamDefinition } from "../models/team-definition.ts";
import { TileType } from "../models/tile-type.ts";
import { User } from "../models/user.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is not set. Copy server/.env.example to server/.env, then run npm run db:up from the repo root.",
  );
}

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  models: [
    User,
    TeamDefinition,
    MapTemplate,
    MapTemplateLine,
    MapTemplateNode,
    MapTemplateNodeLine,
    MapTemplateNodeChallenge,
    MapTemplateEdge,
    TileType,
    Lobby,
    LobbyMember,
    LobbyNotification,
    LobbyTeamAssignment,
    Game,
    GameTeam,
    GameParticipant,
    GameNode,
    GameNodeLine,
    GameLine,
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
    ChallengeType,
    ChallengeDeck,
    Challenge,
    GameNodeChallenge,
    GameChallengeInstance,
    GameChallengeSubmission,
  ],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});
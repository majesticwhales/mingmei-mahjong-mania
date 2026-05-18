import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { GameCommandQueueItem } from "./game-command-queue-item.ts";
import { GameEdge } from "./game-edge.ts";
import { GameLine } from "./game-line.ts";
import { GameEvent } from "./game-event.ts";
import { GameScheduledJob } from "./game-scheduled-job.ts";
import { GameChallengeInstance } from "./game-challenge-instance.ts";
import { MediaAsset } from "./media-asset.ts";
import { GameNode } from "./game-node.ts";
import { GameRuleFlag } from "./game-rule-flag.ts";
import { GameTile } from "./game-tile.ts";
import { GameParticipant } from "./game-participant.ts";
import { Lobby } from "./lobby.ts";
import { MapTemplate } from "./map-template.ts";
import { GameTeam } from "./game-team.ts";

export type GameStatus = "active" | "ending" | "ended";

@Table({ tableName: "games" })
export class Game extends BaseModel {
  @ForeignKey(() => Lobby)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare lobbyId: string;

  @BelongsTo(() => Lobby)
  declare lobby?: Lobby;

  @ForeignKey(() => MapTemplate)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateId: string;

  @BelongsTo(() => MapTemplate)
  declare mapTemplate?: MapTemplate;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "active",
  })
  declare status: GameStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare endsAt: Date;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare durationSeconds: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 13 })
  declare handSize: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare visibilityPhase: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare visibilityPhaseIntervalSeconds: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare configVersion: number;

  @HasMany(() => GameTeam)
  declare teams?: GameTeam[];

  @HasMany(() => GameParticipant)
  declare participants?: GameParticipant[];

  @HasMany(() => GameNode)
  declare nodes?: GameNode[];

  @HasMany(() => GameEdge)
  declare edges?: GameEdge[];

  @HasMany(() => GameLine)
  declare lines?: GameLine[];

  @HasMany(() => GameTile)
  declare tiles?: GameTile[];

  @HasMany(() => GameRuleFlag)
  declare ruleFlags?: GameRuleFlag[];

  @HasMany(() => GameEvent)
  declare events?: GameEvent[];

  @HasMany(() => GameCommandQueueItem)
  declare commandQueue?: GameCommandQueueItem[];

  @HasMany(() => GameScheduledJob)
  declare scheduledJobs?: GameScheduledJob[];

  @HasMany(() => MediaAsset)
  declare mediaAssets?: MediaAsset[];

  @HasMany(() => GameChallengeInstance)
  declare challengeInstances?: GameChallengeInstance[];
}

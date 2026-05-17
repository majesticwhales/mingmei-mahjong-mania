import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { GameEdge } from "./game-edge.ts";
import { GameNode } from "./game-node.ts";
import { GameParticipant } from "./game-participant.ts";
import { GameTeam } from "./game-team.ts";
import { Lobby } from "./lobby.ts";
import { MapTemplate } from "./map-template.ts";

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
}

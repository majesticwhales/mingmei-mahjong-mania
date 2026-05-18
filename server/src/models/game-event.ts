import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { GameTeam } from "./game-team.ts";
import { User } from "./user.ts";

@Table({ tableName: "game_events" })
export class GameEvent extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @Column({ type: DataType.BIGINT, allowNull: false })
  declare sequence: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare eventType: string;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: true })
  declare actorUserId: string | null;

  @BelongsTo(() => User)
  declare actorUser?: User;

  @ForeignKey(() => GameTeam)
  @Column({ type: DataType.UUID, allowNull: true })
  declare actorGameTeamId: string | null;

  @BelongsTo(() => GameTeam)
  declare actorGameTeam?: GameTeam;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare payload: Record<string, unknown>;
}

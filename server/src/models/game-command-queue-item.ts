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

export type CommandQueueStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed";

@Table({ tableName: "game_command_queue" })
export class GameCommandQueueItem extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => GameTeam)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameTeamId: string;

  @BelongsTo(() => GameTeam)
  declare gameTeam?: GameTeam;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare commandType: string;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare payload: Record<string, unknown>;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "pending",
  })
  declare status: CommandQueueStatus;

  @Column({ type: DataType.UUID, allowNull: false })
  declare clientCommandId: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare errorMessage: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare processedAt: Date | null;
}

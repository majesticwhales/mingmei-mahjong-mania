import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";

export type ScheduledJobType =
  | "VISIBILITY_PHASE_ADVANCE"
  | "GAME_END"
  | "NOTIFICATION"
  | "SLOT_UNLOCKED"
  | "SLOT_MAP_UNLOCKED";

export type ScheduledJobStatus =
  | "pending"
  | "processing"
  | "done"
  | "failed";

@Table({ tableName: "game_scheduled_jobs" })
export class GameScheduledJob extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare jobType: ScheduledJobType;

  @Column({ type: DataType.DATE, allowNull: false })
  declare runAt: Date;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "pending",
  })
  declare status: ScheduledJobStatus;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare payload: Record<string, unknown> | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare completedAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare errorMessage: string | null;
}

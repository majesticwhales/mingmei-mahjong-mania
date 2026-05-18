import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Challenge } from "./challenge.ts";
import { Game } from "./game.ts";
import { GameChallengeSubmission } from "./game-challenge-submission.ts";
import { GameTeam } from "./game-team.ts";

export type GameChallengeInstanceStatus =
  | "active"
  | "submitted"
  | "approved"
  | "rejected"
  | "cancelled";

@Table({ tableName: "game_challenge_instances" })
export class GameChallengeInstance extends BaseModel {
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

  @ForeignKey(() => Challenge)
  @Column({ type: DataType.UUID, allowNull: false })
  declare challengeId: string;

  @BelongsTo(() => Challenge)
  declare challenge?: Challenge;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "active",
  })
  declare status: GameChallengeInstanceStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  declare assignedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare expiresAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare resolvedAt: Date | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare resolutionPayload: Record<string, unknown> | null;

  @HasMany(() => GameChallengeSubmission)
  declare submissions?: GameChallengeSubmission[];
}

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
import { GameNodeChallenge } from "./game-node-challenge.ts";
import { GameTeam } from "./game-team.ts";

/**
 * The first three values are the honor-system flow used by the Phase H
 * MVP. The remaining five are reserved for the future resolver workflow
 * (with submissions and reviewer approval); they share the same table
 * and CHECK constraint but never participate in the swap-credit lifecycle.
 */
export type GameChallengeInstanceStatus =
  | "in_progress"
  | "completed"
  | "failed"
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

  @ForeignKey(() => GameNodeChallenge)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameNodeChallengeId: string;

  @BelongsTo(() => GameNodeChallenge)
  declare gameNodeChallenge?: GameNodeChallenge;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "in_progress",
  })
  declare status: GameChallengeInstanceStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  declare assignedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare expiresAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare resolvedAt: Date | null;

  /**
   * Honor-system flow: stamped on resolution (`completed` or `failed`)
   * to `resolvedAt + 5min`. The team cannot re-engage this same node
   * challenge until `cooldown_until` has elapsed. Null until the first
   * resolution.
   */
  @Column({ type: DataType.DATE, allowNull: true })
  declare cooldownUntil: Date | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare resolutionPayload: Record<string, unknown> | null;

  @HasMany(() => GameChallengeSubmission)
  declare submissions?: GameChallengeSubmission[];
}

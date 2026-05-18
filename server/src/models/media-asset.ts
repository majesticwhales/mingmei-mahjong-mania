import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { GameChallengeSubmission } from "./game-challenge-submission.ts";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { User } from "./user.ts";

export type MediaPurpose = "check_in" | "challenge_submission" | "other";

export type MediaStatus = "pending" | "ready" | "failed";

@Table({ tableName: "media_assets" })
export class MediaAsset extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  @Column({ type: DataType.STRING(32), allowNull: false })
  declare purpose: MediaPurpose;

  @Column({ type: DataType.STRING(512), allowNull: false })
  declare storageKey: string;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "pending",
  })
  declare status: MediaStatus;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare contentType: string | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare byteSize: number | null;

  @Column({ type: DataType.DATE, allowNull: false })
  declare expiresAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare deletedAt: Date | null;

  @HasMany(() => GameChallengeSubmission)
  declare challengeSubmissions?: GameChallengeSubmission[];
}

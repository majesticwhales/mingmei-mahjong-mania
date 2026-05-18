import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { GameChallengeInstance } from "./game-challenge-instance.ts";
import { MediaAsset } from "./media-asset.ts";
import { User } from "./user.ts";

export type GameChallengeSubmissionStatus = "pending" | "accepted" | "rejected";

@Table({ tableName: "game_challenge_submissions" })
export class GameChallengeSubmission extends BaseModel {
  @ForeignKey(() => GameChallengeInstance)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameChallengeInstanceId: string;

  @BelongsTo(() => GameChallengeInstance)
  declare gameChallengeInstance?: GameChallengeInstance;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare submittedByUserId: string;

  @BelongsTo(() => User)
  declare submittedByUser?: User;

  @ForeignKey(() => MediaAsset)
  @Column({ type: DataType.UUID, allowNull: true })
  declare mediaAssetId: string | null;

  @BelongsTo(() => MediaAsset)
  declare mediaAsset?: MediaAsset;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare payload: Record<string, unknown>;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "pending",
  })
  declare status: GameChallengeSubmissionStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  declare submittedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true })
  declare reviewedAt: Date | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare rejectionReason: string | null;
}

import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { ChallengeDeck } from "./challenge-deck.ts";
import { ChallengeType } from "./challenge-type.ts";
import { GameChallengeInstance } from "./game-challenge-instance.ts";

@Table({ tableName: "challenges" })
export class Challenge extends BaseModel {
  @ForeignKey(() => ChallengeDeck)
  @Column({ type: DataType.UUID, allowNull: false })
  declare challengeDeckId: string;

  @BelongsTo(() => ChallengeDeck)
  declare challengeDeck?: ChallengeDeck;

  @ForeignKey(() => ChallengeType)
  @Column({ type: DataType.UUID, allowNull: false })
  declare challengeTypeId: string;

  @BelongsTo(() => ChallengeType)
  declare challengeType?: ChallengeType;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(256), allowNull: false })
  declare title: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare flavorText: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare imageUrl: string | null;

  @Column({ type: DataType.JSONB, allowNull: false, defaultValue: {} })
  declare parameters: Record<string, unknown>;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare sortOrder: number;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @HasMany(() => GameChallengeInstance)
  declare gameInstances?: GameChallengeInstance[];
}

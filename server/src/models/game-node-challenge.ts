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
import { GameChallengeInstance } from "./game-challenge-instance.ts";
import { GameNode } from "./game-node.ts";

@Table({ tableName: "game_node_challenges" })
export class GameNodeChallenge extends BaseModel {
  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameNodeId: string;

  @BelongsTo(() => GameNode)
  declare gameNode?: GameNode;

  @ForeignKey(() => Challenge)
  @Column({ type: DataType.UUID, allowNull: false })
  declare challengeId: string;

  @BelongsTo(() => Challenge)
  declare challenge?: Challenge;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sortOrder: number;

  @HasMany(() => GameChallengeInstance)
  declare instances?: GameChallengeInstance[];
}

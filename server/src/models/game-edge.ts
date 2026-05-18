import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { GameNode } from "./game-node.ts";

@Table({ tableName: "game_edges" })
export class GameEdge extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare fromGameNodeId: string;

  @BelongsTo(() => GameNode, "fromGameNodeId")
  declare fromGameNode?: GameNode;

  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare toGameNodeId: string;

  @BelongsTo(() => GameNode, "toGameNodeId")
  declare toGameNode?: GameNode;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare weight: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare travelSeconds: number | null;
}

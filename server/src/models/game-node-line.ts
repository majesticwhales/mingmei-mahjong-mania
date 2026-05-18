import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { GameLine } from "./game-line.ts";
import { GameNode } from "./game-node.ts";

@Table({ tableName: "game_node_lines" })
export class GameNodeLine extends BaseModel {
  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameNodeId: string;

  @BelongsTo(() => GameNode)
  declare gameNode?: GameNode;

  @ForeignKey(() => GameLine)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameLineId: string;

  @BelongsTo(() => GameLine)
  declare gameLine?: GameLine;
}

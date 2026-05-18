import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { GameNode } from "./game-node.ts";

@Table({ tableName: "game_node_visibility_groups" })
export class GameNodeVisibilityGroup extends BaseModel {
  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare gameNodeId: string;

  @BelongsTo(() => GameNode)
  declare gameNode?: GameNode;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare groupIndex: number;
}

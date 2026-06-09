import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Challenge } from "./challenge.ts";
import { MapTemplateNode } from "./map-template-node.ts";

@Table({ tableName: "map_template_node_challenges" })
export class MapTemplateNodeChallenge extends BaseModel {
  @ForeignKey(() => MapTemplateNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateNodeId: string;

  @BelongsTo(() => MapTemplateNode)
  declare mapTemplateNode?: MapTemplateNode;

  @ForeignKey(() => Challenge)
  @Column({ type: DataType.UUID, allowNull: false })
  declare challengeId: string;

  @BelongsTo(() => Challenge)
  declare challenge?: Challenge;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sortOrder: number;
}

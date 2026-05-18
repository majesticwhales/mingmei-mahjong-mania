import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { MapTemplate } from "./map-template.ts";
import { MapTemplateNode } from "./map-template-node.ts";

@Table({ tableName: "map_template_edges" })
export class MapTemplateEdge extends BaseModel {
  @ForeignKey(() => MapTemplate)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateId: string;

  @BelongsTo(() => MapTemplate)
  declare mapTemplate?: MapTemplate;

  @ForeignKey(() => MapTemplateNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare fromNodeId: string;

  @BelongsTo(() => MapTemplateNode, "fromNodeId")
  declare fromNode?: MapTemplateNode;

  @ForeignKey(() => MapTemplateNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare toNodeId: string;

  @BelongsTo(() => MapTemplateNode, "toNodeId")
  declare toNode?: MapTemplateNode;

}

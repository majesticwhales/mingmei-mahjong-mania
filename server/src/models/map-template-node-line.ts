import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { MapTemplateLine } from "./map-template-line.ts";
import { MapTemplateNode } from "./map-template-node.ts";

@Table({ tableName: "map_template_node_lines" })
export class MapTemplateNodeLine extends BaseModel {
  @ForeignKey(() => MapTemplateNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateNodeId: string;

  @BelongsTo(() => MapTemplateNode)
  declare mapTemplateNode?: MapTemplateNode;

  @ForeignKey(() => MapTemplateLine)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateLineId: string;

  @BelongsTo(() => MapTemplateLine)
  declare mapTemplateLine?: MapTemplateLine;
}

import {
  Column,
  DataType,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { MapTemplateEdge } from "./map-template-edge.ts";
import { MapTemplateLine } from "./map-template-line.ts";
import { MapTemplateNode } from "./map-template-node.ts";

@Table({ tableName: "map_templates" })
export class MapTemplate extends BaseModel {
  @Column({ type: DataType.STRING(128), allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare defaultDurationSeconds: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 13 })
  declare defaultHandSize: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 84 })
  declare nodeCount: number;

  @HasMany(() => MapTemplateNode)
  declare nodes?: MapTemplateNode[];

  @HasMany(() => MapTemplateLine)
  declare lines?: MapTemplateLine[];

  @HasMany(() => MapTemplateEdge)
  declare edges?: MapTemplateEdge[];
}

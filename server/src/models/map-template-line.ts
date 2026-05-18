import {
  BelongsTo,
  BelongsToMany,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { MapTemplate } from "./map-template.ts";
import { MapTemplateNode } from "./map-template-node.ts";
import { MapTemplateNodeLine } from "./map-template-node-line.ts";

@Table({ tableName: "map_template_lines" })
export class MapTemplateLine extends BaseModel {
  @ForeignKey(() => MapTemplate)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateId: string;

  @BelongsTo(() => MapTemplate)
  declare mapTemplate?: MapTemplate;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare name: string | null;

  @Column({ type: DataType.STRING(32), allowNull: true })
  declare shortName: string | null;

  @Column({ type: DataType.STRING(7), allowNull: true })
  declare color: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare sortOrder: number;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare renderMetadata: {
    stationIds: string[];
    bends: Record<string, Array<{ x: number; y: number }>> | null;
  } | null;

  @BelongsToMany(() => MapTemplateNode, () => MapTemplateNodeLine)
  declare nodes?: MapTemplateNode[];

  @HasMany(() => MapTemplateNodeLine)
  declare nodeLines?: MapTemplateNodeLine[];
}

import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { MapTemplate } from "./map-template.ts";

@Table({ tableName: "map_template_nodes" })
export class MapTemplateNode extends BaseModel {
  @ForeignKey(() => MapTemplate)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateId: string;

  @BelongsTo(() => MapTemplate)
  declare mapTemplate?: MapTemplate;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  declare name: string;

  @Column({ type: DataType.DOUBLE, allowNull: false })
  declare latitude: number;

  @Column({ type: DataType.DOUBLE, allowNull: false })
  declare longitude: number;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare geofenceRadiusMeters: number | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare coordinateX: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare coordinateY: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare lineId: number;

  @Column({ type: DataType.STRING(16), allowNull: false })
  declare labelAnchor: string;

  @Column({ type: DataType.BOOLEAN, allowNull: false })
  declare isInterchange: boolean;
}

import { Column, DataType, Table } from "sequelize-typescript";
import { BaseModel } from "./base.ts";

@Table({ tableName: "tile_types" })
export class TileType extends BaseModel {
  @Column({ type: DataType.STRING(32), allowNull: false })
  declare suit: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare rank: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare copyIndex: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare suitSortOrder: number;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare displayName: string;
}

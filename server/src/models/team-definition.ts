import { Column, DataType, Table } from "sequelize-typescript";
import { BaseModel } from "./base.ts";

@Table({ tableName: "team_definitions" })
export class TeamDefinition extends BaseModel {
  @Column({ type: DataType.STRING(32), allowNull: false, unique: true })
  declare code: string;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare displayName: string;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare sortOrder: number;
}

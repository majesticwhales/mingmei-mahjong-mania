import { Column, DataType, HasMany, Table } from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Challenge } from "./challenge.ts";

@Table({ tableName: "challenge_types" })
export class ChallengeType extends BaseModel {
  @Column({ type: DataType.STRING(32), allowNull: false, unique: true })
  declare code: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  declare name: string;

  @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
  declare resolverKey: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @HasMany(() => Challenge)
  declare challenges?: Challenge[];
}

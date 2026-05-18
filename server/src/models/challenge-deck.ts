import { Column, DataType, HasMany, Table } from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Challenge } from "./challenge.ts";

@Table({ tableName: "challenge_decks" })
export class ChallengeDeck extends BaseModel {
  @Column({ type: DataType.STRING(64), allowNull: false, unique: true })
  declare code: string;

  @Column({ type: DataType.STRING(128), allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: true })
  declare isActive: boolean;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare sortOrder: number;

  @HasMany(() => Challenge)
  declare challenges?: Challenge[];
}

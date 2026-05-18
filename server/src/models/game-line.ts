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
import { Game } from "./game.ts";
import { GameNode } from "./game-node.ts";
import { GameNodeLine } from "./game-node-line.ts";
import { MapTemplateLine } from "./map-template-line.ts";

@Table({ tableName: "game_lines" })
export class GameLine extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => MapTemplateLine)
  @Column({ type: DataType.UUID, allowNull: false })
  declare templateLineId: string;

  @BelongsTo(() => MapTemplateLine)
  declare templateLine?: MapTemplateLine;

  @Column({ type: DataType.STRING(64), allowNull: false })
  declare code: string;

  @Column({ type: DataType.STRING(128), allowNull: true })
  declare name: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare sortOrder: number;

  @BelongsToMany(() => GameNode, () => GameNodeLine)
  declare nodes?: GameNode[];

  @HasMany(() => GameNodeLine)
  declare nodeLines?: GameNodeLine[];
}

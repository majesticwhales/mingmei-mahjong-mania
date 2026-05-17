import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { MapTemplateNode } from "./map-template-node.ts";

@Table({ tableName: "game_nodes" })
export class GameNode extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => MapTemplateNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare templateNodeId: string;

  @BelongsTo(() => MapTemplateNode)
  declare templateNode?: MapTemplateNode;

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
}

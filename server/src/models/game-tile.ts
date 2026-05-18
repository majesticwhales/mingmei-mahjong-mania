import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasOne,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { GameTilePlacement } from "./game-tile-placement.ts";
import { TileType } from "./tile-type.ts";

@Table({ tableName: "game_tiles" })
export class GameTile extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => TileType)
  @Column({ type: DataType.UUID, allowNull: false })
  declare tileTypeId: string;

  @BelongsTo(() => TileType)
  declare tileType?: TileType;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare copyIndex: number;

  @HasOne(() => GameTilePlacement)
  declare placement?: GameTilePlacement;
}

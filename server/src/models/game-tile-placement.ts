import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { GameNode } from "./game-node.ts";
import { GameTeam } from "./game-team.ts";
import { GameTile } from "./game-tile.ts";

@Table({ tableName: "game_tile_placements" })
export class GameTilePlacement extends BaseModel {
  @ForeignKey(() => GameTile)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare gameTileId: string;

  @BelongsTo(() => GameTile)
  declare gameTile?: GameTile;

  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: true })
  declare gameNodeId: string | null;

  @BelongsTo(() => GameNode)
  declare gameNode?: GameNode;

  @ForeignKey(() => GameTeam)
  @Column({ type: DataType.UUID, allowNull: true })
  declare gameTeamId: string | null;

  @BelongsTo(() => GameTeam)
  declare gameTeam?: GameTeam;
}

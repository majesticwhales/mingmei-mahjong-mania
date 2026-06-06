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

  /**
   * Slot ordinal at the node this tile occupies, in `[0, games.slots_per_node)`.
   * Set iff `gameNodeId` is set; null for hand and dead-wall placements. A
   * partial unique index on `(game_node_id, slot_index) WHERE game_node_id
   * IS NOT NULL` enforces at most one tile per addressable slot. Slot
   * identity is a property of the node, not the tile: SWAP_TILE swaps
   * `slotIndex` along with `gameNodeId`/`gameTeamId` so the incoming hand
   * tile lands in the vacated slot (chunk 3).
   */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare slotIndex: number | null;

  /**
   * Position in the per-game dead wall (0-based). Set iff this placement
   * is in the dead wall (neither `gameNodeId` nor `gameTeamId` populated);
   * null for node and hand placements. Dead-wall tiles never move — no
   * engine command re-targets them — so the tri-state CHECK constraint
   * (`game_tile_placements_target_exactly_one`) is invariant for the
   * lifetime of the placement. Index 0 is the dora indicator consumed by
   * the scoring module (`analyzeHand`).
   */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare deadWallIndex: number | null;
}

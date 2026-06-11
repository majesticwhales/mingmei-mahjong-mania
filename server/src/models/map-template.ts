import {
  Column,
  DataType,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import type { VisibilityMode } from "../game/visibility-mode.ts";
import { MapTemplateEdge } from "./map-template-edge.ts";
import { MapTemplateLine } from "./map-template-line.ts";
import { MapTemplateNode } from "./map-template-node.ts";

@Table({ tableName: "map_templates" })
export class MapTemplate extends BaseModel {
  @Column({ type: DataType.STRING(128), allowNull: false })
  declare name: string;

  @Column({ type: DataType.TEXT, allowNull: true })
  declare description: string | null;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare defaultDurationSeconds: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 13 })
  declare defaultHandSize: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 84 })
  declare nodeCount: number;

  /**
   * Default tile-slot capacity at each node on this template. Lobbies inherit this
   * as `slots_per_node`. Capacity, not realized count — the dealer fills each slot
   * at game start, but runtime tile counts at a node may shift as commands move tiles.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare defaultSlotsPerNode: number;

  /** Default number of visibility phases (= number of visibility groups). Lobbies inherit this. */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 4 })
  declare defaultVisibilityPhaseCount: number;

  /**
   * Default visibility mode for lobbies built from this template. Picks
   * which of the two visibility layers are active for the resulting
   * game: `none` (neither), `phase` (node-group phase reveal only),
   * `slot` (per-slot tier only), or `both` (current default).
   * See `server/src/game/visibility-mode.ts` for the semantics and
   * TDD §3.2 / §3.3 for the layer definitions.
   */
  @Column({
    type: DataType.STRING(8),
    allowNull: false,
    defaultValue: "both",
  })
  declare defaultVisibilityMode: VisibilityMode;

  /**
   * Per-slot unlock offsets in seconds from `games.started_at`, one entry per
   * `slot_index`. Length must equal `defaultSlotsPerNode`; the first entry
   * must be 0 (slot 0 always unlocked); all entries must be `>= 0`. Lobbies
   * inherit this as `slotUnlockOffsetsSeconds`.
   */
  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: false,
    defaultValue: [0],
  })
  declare defaultSlotUnlockOffsetsSeconds: number[];

  /**
   * Per-slot map-reveal offsets in seconds from `games.started_at`, one
   * entry per `slot_index`. Length must equal `defaultSlotsPerNode`; the
   * first entry must be `0` (slot 0 always immediately on-map at start);
   * each entry must either be `>= defaultSlotUnlockOffsetsSeconds[k]` (map
   * reveal not earlier than claim reveal) or `NULL` (slot is never on the
   * map regardless of timer — the "out of play on map" tier). Lobbies
   * inherit this as `slotMapUnlockOffsetsSeconds`.
   *
   * Per Phase L (§3.13): this is the **map**-side reveal timer, independent
   * of `defaultSlotUnlockOffsetsSeconds` which gates engine claimability +
   * station-side reveal. The split lets a template express tier-2 (claim
   * immediately, reveal on map later) and tier-3 (out of play until t1,
   * then visible on map at t2) without coupling the two surfaces.
   */
  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: false,
    defaultValue: [0],
  })
  declare defaultSlotMapUnlockOffsetsSeconds: Array<number | null>;

  /** Station code on this template where all teams spawn (e.g. "bay"). */
  @Column({ type: DataType.STRING(64), allowNull: true })
  declare defaultStartNodeCode: string | null;

  /**
   * Default size of the per-game dead wall for this template. Lobbies
   * inherit this as `dead_wall_size`. The dealer mints `default_dead_wall_size`
   * extra tiles from the catalog at game start and parks them as
   * `dead_wall_index` placements (the first entry is the dora indicator,
   * see TDD §3.9). The closed-set invariant
   *   defaultSlotsPerNode * nodeCount + defaultHandSize * teamCount
   *   + defaultDeadWallSize === catalogSize
   * is enforced by the dealer, not the DB.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare defaultDeadWallSize: number;

  @HasMany(() => MapTemplateNode)
  declare nodes?: MapTemplateNode[];

  @HasMany(() => MapTemplateLine)
  declare lines?: MapTemplateLine[];

  @HasMany(() => MapTemplateEdge)
  declare edges?: MapTemplateEdge[];
}

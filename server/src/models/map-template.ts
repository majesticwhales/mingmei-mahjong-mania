import {
  Column,
  DataType,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
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
   * Per-slot map-visibility flags, one entry per `slot_index`. When false,
   * that slot never appears face-up on the map regardless of phase; tiles in
   * it are only visible to a team checked in at the station. Length must
   * equal `defaultSlotsPerNode`; the first entry must be `true` (slot 0
   * follows phase visibility). Lobbies inherit this as `slotMapVisible`.
   */
  @Column({
    type: DataType.ARRAY(DataType.BOOLEAN),
    allowNull: false,
    defaultValue: [true],
  })
  declare defaultSlotMapVisible: boolean[];

  /** Station code on this template where all teams spawn (e.g. "bay"). */
  @Column({ type: DataType.STRING(64), allowNull: true })
  declare defaultStartNodeCode: string | null;

  @HasMany(() => MapTemplateNode)
  declare nodes?: MapTemplateNode[];

  @HasMany(() => MapTemplateLine)
  declare lines?: MapTemplateLine[];

  @HasMany(() => MapTemplateEdge)
  declare edges?: MapTemplateEdge[];
}

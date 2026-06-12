import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import type { VisibilityMode } from "../game/visibility-mode.ts";
import { LobbyMember } from "./lobby-member.ts";
import { LobbyNotification } from "./lobby-notification.ts";
import { LobbyTeamAssignment } from "./lobby-team-assignment.ts";
import { MapTemplate } from "./map-template.ts";
import { User } from "./user.ts";

export type LobbyStatus = "waiting" | "starting" | "closed";
export type TeamAssignmentMode = "pick" | "random" | "mixed";

@Table({ tableName: "lobbies" })
export class Lobby extends BaseModel {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare hostUserId: string;

  @BelongsTo(() => User, "hostUserId")
  declare host?: User;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "waiting",
  })
  declare status: LobbyStatus;

  @ForeignKey(() => MapTemplate)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateId: string;

  @BelongsTo(() => MapTemplate)
  declare mapTemplate?: MapTemplate;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare gameDurationSeconds: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare visibilityPhaseIntervalSeconds: number;

  /** Number of visibility phases / groups for this lobby. Snapshotted to `games.visibility_phase_count` at start. */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 4 })
  declare visibilityPhaseCount: number;

  /**
   * Picks which of the two visibility layers the game uses (TDD §3.2 /
   * §3.3). Sourced from `mapTemplate.defaultVisibilityMode` on lobby
   * creation, editable by the host, snapshotted to
   * `games.visibility_mode` at start. The mode also locks the
   * irrelevant knobs at the service layer: a lobby in `slot` mode
   * cannot edit `visibility_phase_count`, etc. See
   * `server/src/game/visibility-mode.ts`.
   */
  @Column({
    type: DataType.STRING(8),
    allowNull: false,
    defaultValue: "both",
  })
  declare visibilityMode: VisibilityMode;

  /**
   * Tile-slot capacity at each node. The dealer fills this many tiles per node at
   * game start; runtime tile counts may diverge as commands move tiles around.
   * Snapshotted to `games.slots_per_node` at start.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare slotsPerNode: number;

  /**
   * Per-slot unlock offsets (seconds from `games.started_at`) for this lobby.
   * Length === `slotsPerNode`; first entry is 0; all entries `>= 0`. Sourced
   * from `mapTemplate.defaultSlotUnlockOffsetsSeconds` on lobby creation,
   * editable by the host, snapshotted to `games.slotUnlockOffsetsSeconds` at
   * start. Uniform across all nodes and all teams in the game.
   */
  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: false,
    defaultValue: [0],
  })
  declare slotUnlockOffsetsSeconds: number[];

  /**
   * Per-slot map-reveal offsets in seconds from `games.started_at` (Phase L
   * §3.13). Length === `slotsPerNode`; first entry is `0` (slot 0 always
   * on-map at start); each entry must either be `>= slotUnlockOffsetsSeconds[k]`
   * (map reveal not earlier than claim reveal) or `NULL` (slot is never on
   * the map — the "out of play on map" tier). Sourced from
   * `mapTemplate.defaultSlotMapUnlockOffsetsSeconds` on lobby creation,
   * editable by host, snapshotted to `games.slotMapUnlockOffsetsSeconds` at
   * start.
   *
   * Independent of `slotUnlockOffsetsSeconds` (which gates engine
   * claimability + station-side reveal). The split lets a host opt into
   * tier-2 (claim immediately, reveal on map later) and tier-3 (out of play
   * until t1, then visible on map at t2) without coupling the two surfaces.
   */
  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: false,
    defaultValue: [0],
  })
  declare slotMapUnlockOffsetsSeconds: Array<number | null>;

  /**
   * Size of the per-game dead wall snapshotted to `games.dead_wall_size`
   * at start. Sourced from `mapTemplate.defaultDeadWallSize` on lobby
   * creation, editable by the host. The dealer mints this many extra
   * tiles from the catalog as dead-wall placements; the first becomes
   * the dora indicator. Must satisfy the closed-set invariant
   *   slotsPerNode * nodeCount + handSize * teamCount + deadWallSize
   *   === catalogSize
   * (enforced by the dealer at game start).
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare deadWallSize: number;

  /**
   * Per-(team, challenge) cooldown floor (in seconds) applied after a
   * challenge resolves (completion or forfeit). Sourced from the chosen
   * `LobbyGamePreset.challengeCooldownSeconds` on lobby creation,
   * editable by the host, snapshotted to
   * `games.challenge_cooldown_seconds` at start. See TDD §3.8.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 300 })
  declare challengeCooldownSeconds: number;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "pick",
  })
  declare teamAssignmentMode: TeamAssignmentMode;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 4 })
  declare minPlayersToStart: number;

  /** Station code on the lobby map where all teams start (from template by default). */
  @Column({ type: DataType.STRING(64), allowNull: true })
  declare defaultStartNodeCode: string | null;

  @Column({ type: DataType.DATE, allowNull: true })
  declare configUpdatedAt: Date | null;

  @HasMany(() => LobbyMember)
  declare members?: LobbyMember[];

  @HasMany(() => LobbyTeamAssignment)
  declare teamAssignments?: LobbyTeamAssignment[];

  @HasMany(() => LobbyNotification)
  declare notifications?: LobbyNotification[];
}

import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
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
   * Per-slot map-visibility flags. Length === `slotsPerNode`; first entry is
   * `true` (slot 0 follows phase rules). When false, that slot index never
   * shows face-up on the map regardless of phase; it's only visible to a
   * team checked in at the station. Sourced from
   * `mapTemplate.defaultSlotMapVisible` on lobby creation, editable by host.
   */
  @Column({
    type: DataType.ARRAY(DataType.BOOLEAN),
    allowNull: false,
    defaultValue: [true],
  })
  declare slotMapVisible: boolean[];

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

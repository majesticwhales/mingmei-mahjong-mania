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
import { GameCommandQueueItem } from "./game-command-queue-item.ts";
import { GameEdge } from "./game-edge.ts";
import { GameLine } from "./game-line.ts";
import { GameEvent } from "./game-event.ts";
import { GameScheduledJob } from "./game-scheduled-job.ts";
import { GameChallengeInstance } from "./game-challenge-instance.ts";
import { MediaAsset } from "./media-asset.ts";
import { GameNode } from "./game-node.ts";
import { GameRuleFlag } from "./game-rule-flag.ts";
import { GameTile } from "./game-tile.ts";
import { GameParticipant } from "./game-participant.ts";
import { Lobby } from "./lobby.ts";
import { MapTemplate } from "./map-template.ts";
import { GameTeam } from "./game-team.ts";

export type GameStatus = "active" | "ending" | "ended";

@Table({ tableName: "games" })
export class Game extends BaseModel {
  @ForeignKey(() => Lobby)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare lobbyId: string;

  @BelongsTo(() => Lobby)
  declare lobby?: Lobby;

  @ForeignKey(() => MapTemplate)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateId: string;

  @BelongsTo(() => MapTemplate)
  declare mapTemplate?: MapTemplate;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "active",
  })
  declare status: GameStatus;

  @Column({ type: DataType.DATE, allowNull: false })
  declare startedAt: Date;

  @Column({ type: DataType.DATE, allowNull: false })
  declare endsAt: Date;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare durationSeconds: number;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 13 })
  declare handSize: number;

  /**
   * Tile-slot capacity at each node. Snapshotted from `lobby.slots_per_node` at game start.
   * Determines how many tiles the dealer places at each node; runtime counts may shift.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare slotsPerNode: number;

  /**
   * Per-slot unlock offsets in seconds from `startedAt`, snapshotted from
   * `lobby.slotUnlockOffsetsSeconds` at start. Length === `slotsPerNode`;
   * first entry is 0; all entries `>= 0`. Slot `k` is unlocked once
   * `now >= startedAt + slotUnlockOffsetsSeconds[k] * 1000`. Engine handlers
   * read this to reject `SWAP_TILE` against locked slots; the scheduler
   * seeds one `SLOT_UNLOCKED` job per non-zero offset (chunk 4).
   */
  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: false,
    defaultValue: [0],
  })
  declare slotUnlockOffsetsSeconds: number[];

  /**
   * Per-slot map-reveal offsets in seconds from `startedAt`, snapshotted
   * from `lobby.slotMapUnlockOffsetsSeconds` at start. Length ===
   * `slotsPerNode`; first entry is `0` (slot 0 always immediately on the
   * map); each entry must either be `>= slotUnlockOffsetsSeconds[k]` or
   * `NULL` (slot is never on the map regardless of timer). Phase L (§3.13)
   * uses this for the **map**-surface reveal — engine claimability +
   * station-surface reveal still come from `slotUnlockOffsetsSeconds`.
   *
   * The scheduler seeds one `SLOT_MAP_UNLOCKED` job per slot whose offset
   * is non-null, positive, AND differs from the claim offset (dedupe
   * coincident timers). The projection derives `mapNodes[].tiles[].visible`
   * from this column via `isSlotMapUnlocked` / `mapUnlockedSlotIndices`.
   */
  @Column({
    type: DataType.ARRAY(DataType.INTEGER),
    allowNull: false,
    defaultValue: [0],
  })
  declare slotMapUnlockOffsetsSeconds: Array<number | null>;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare visibilityPhase: number;

  /** Snapshotted from `lobby.visibility_phase_count` at game start. Determines number of visibility groups. */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 4 })
  declare visibilityPhaseCount: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare visibilityPhaseIntervalSeconds: number;

  /**
   * Snapshot of `lobby.visibility_mode` taken at game start. Selects
   * which of the two visibility layers (phase reveal §3.2 / per-slot
   * tier §3.3) are active for this game. The engine, scheduler, and
   * projection branch on this value via `visibilityIncludes()`. See
   * `server/src/game/visibility-mode.ts`.
   */
  @Column({
    type: DataType.STRING(8),
    allowNull: false,
    defaultValue: "both",
  })
  declare visibilityMode: VisibilityMode;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare configVersion: number;

  /**
   * Randomized round wind for the game (`1..4` matching the scoring module's
   * `WindRank` codes: 1 East / 2 South / 3 West / 4 North). Set by
   * `GameStartService` at game creation; never mutated afterwards. Consumed
   * by the `analyzeHand` projection wiring (§3.9) for yakuhai detection on
   * the round wind.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 1 })
  declare roundWind: number;

  /**
   * Snapshot of `lobby.dead_wall_size` taken at game start. Controls how
   * many tiles the dealer parks in the dead wall (`dead_wall_index`
   * placements). The first dead-wall tile is the dora indicator consumed
   * by `analyzeHand`. The dealer enforces the closed-set invariant
   *   slotsPerNode * nodeCount + handSize * teamCount + deadWallSize
   *   === catalogSize
   * at game start; the DB constraints only enforce `>= 0`.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 0 })
  declare deadWallSize: number;

  /**
   * Per-(team, challenge) cooldown floor (in seconds) applied after a
   * challenge resolves. Snapshotted from `lobby.challenge_cooldown_seconds`
   * at game start; read by `complete-challenge.ts`, `forfeit-challenge.ts`,
   * and `autoForfeitActiveChallenge` to stamp `cooldown_until` on the
   * resolved instance. See TDD §3.8.
   */
  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 300 })
  declare challengeCooldownSeconds: number;

  @HasMany(() => GameTeam)
  declare teams?: GameTeam[];

  @HasMany(() => GameParticipant)
  declare participants?: GameParticipant[];

  @HasMany(() => GameNode)
  declare nodes?: GameNode[];

  @HasMany(() => GameEdge)
  declare edges?: GameEdge[];

  @HasMany(() => GameLine)
  declare lines?: GameLine[];

  @HasMany(() => GameTile)
  declare tiles?: GameTile[];

  @HasMany(() => GameRuleFlag)
  declare ruleFlags?: GameRuleFlag[];

  @HasMany(() => GameEvent)
  declare events?: GameEvent[];

  @HasMany(() => GameCommandQueueItem)
  declare commandQueue?: GameCommandQueueItem[];

  @HasMany(() => GameScheduledJob)
  declare scheduledJobs?: GameScheduledJob[];

  @HasMany(() => MediaAsset)
  declare mediaAssets?: MediaAsset[];

  @HasMany(() => GameChallengeInstance)
  declare challengeInstances?: GameChallengeInstance[];
}

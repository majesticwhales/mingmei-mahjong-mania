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

@Table({ tableName: "game_team_positions" })
export class GameTeamPosition extends BaseModel {
  @ForeignKey(() => GameTeam)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare gameTeamId: string;

  @BelongsTo(() => GameTeam)
  declare gameTeam?: GameTeam;

  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: true })
  declare currentGameNodeId: string | null;

  @BelongsTo(() => GameNode)
  declare currentGameNode?: GameNode;

  @Column({ type: DataType.DATE, allowNull: true })
  declare checkedInAt: Date | null;

  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare lastCheckInLatitude: number | null;

  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare lastCheckInLongitude: number | null;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare geofenceValidated: boolean | null;

  @Column({ type: DataType.BOOLEAN, allowNull: true })
  declare geolocationWarning: boolean | null;

  /**
   * Honor-system swap credit. `true` between `CHALLENGE_COMPLETED` and
   * the next `SWAP_TILE` / `CLAIM_WIN` within a single check-in
   * session. Reset to `false` on every `CHECK_IN` / `CHECK_OUT` and on
   * `SWAP_TILE` / `CLAIM_WIN` consumption. Pacing between completions
   * is enforced by the per-station challenge cooldown
   * (`game_challenge_instances.cooldown_until`), not by this flag.
   */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare pendingSwapCredit: boolean;

  /**
   * Phase L telemetry — most recent latitude reported by **any**
   * user-driven command from this team's client. Updated by the shared
   * `recordCommandGeolocation` helper (see
   * `server/src/services/geolocation.ts`). Independent of
   * `lastCheckInLatitude`, which remains the CHECK_IN-time snapshot.
   * `NULL` for teams whose clients have never sent a `geo` block.
   */
  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare lastKnownLatitude: number | null;

  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare lastKnownLongitude: number | null;

  /** Browser-reported accuracy in meters at the moment of the last sample. */
  @Column({ type: DataType.DOUBLE, allowNull: true })
  declare lastKnownAccuracy: number | null;

  /** Server clock when the engine stamped the last-known sample. */
  @Column({ type: DataType.DATE, allowNull: true })
  declare lastKnownSeenAt: Date | null;
}

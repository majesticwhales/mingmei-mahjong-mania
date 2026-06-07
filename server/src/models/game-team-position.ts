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
   * `SWAP_TILE` within a single check-in session. Reset to `false` on
   * every `CHECK_IN` / `CHECK_OUT` and on `SWAP_TILE` consumption.
   */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare pendingSwapCredit: boolean;

  /**
   * Sticky flag preventing a second credit-earning completion within
   * the same check-in session. Set to `true` on `CHALLENGE_COMPLETED`
   * (in addition to `pendingSwapCredit`) and stays `true` until the
   * next `CHECK_IN` / `CHECK_OUT` resets it. Lets `START_CHALLENGE`
   * reject "you already used your credit this visit".
   */
  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare creditEarnedInSession: boolean;
}

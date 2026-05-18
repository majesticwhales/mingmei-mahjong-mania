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
}

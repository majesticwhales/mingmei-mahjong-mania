import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { GameTeam } from "./game-team.ts";

@Table({ tableName: "game_team_home_groups" })
export class GameTeamHomeGroup extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => GameTeam)
  @Column({ type: DataType.UUID, allowNull: false, unique: true })
  declare gameTeamId: string;

  @BelongsTo(() => GameTeam)
  declare gameTeam?: GameTeam;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare groupIndex: number;
}

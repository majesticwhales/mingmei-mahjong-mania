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

export type VisibilitySource = "phase" | "override";

@Table({ tableName: "game_location_team_visibility" })
export class GameLocationTeamVisibility extends BaseModel {
  @ForeignKey(() => GameTeam)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameTeamId: string;

  @BelongsTo(() => GameTeam)
  declare gameTeam?: GameTeam;

  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameNodeId: string;

  @BelongsTo(() => GameNode)
  declare gameNode?: GameNode;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare isFaceUp: boolean;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "phase",
  })
  declare source: VisibilitySource;

  @Column({ type: DataType.DATE, allowNull: true })
  declare revealedAt: Date | null;
}

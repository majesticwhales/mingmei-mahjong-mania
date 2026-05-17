import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { GameParticipant } from "./game-participant.ts";
import { TeamDefinition } from "./team-definition.ts";

@Table({ tableName: "game_teams" })
export class GameTeam extends BaseModel {
  @ForeignKey(() => Game)
  @Column({ type: DataType.UUID, allowNull: false })
  declare gameId: string;

  @BelongsTo(() => Game)
  declare game?: Game;

  @ForeignKey(() => TeamDefinition)
  @Column({ type: DataType.UUID, allowNull: false })
  declare teamDefinitionId: string;

  @BelongsTo(() => TeamDefinition)
  declare teamDefinition?: TeamDefinition;

  @Column({ type: DataType.STRING(64), allowNull: true })
  declare displayName: string | null;

  @HasMany(() => GameParticipant)
  declare participants?: GameParticipant[];
}

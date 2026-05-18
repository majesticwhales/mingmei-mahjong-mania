import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  HasOne,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Game } from "./game.ts";
import { GameChallengeInstance } from "./game-challenge-instance.ts";
import { GameLocationTeamVisibility } from "./game-location-team-visibility.ts";
import { GameParticipant } from "./game-participant.ts";
import { GameTeamHomeGroup } from "./game-team-home-group.ts";
import { GameTeamPosition } from "./game-team-position.ts";
import { GameTilePlacement } from "./game-tile-placement.ts";
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

  @HasMany(() => GameTilePlacement)
  declare tilePlacements?: GameTilePlacement[];

  @HasOne(() => GameTeamPosition)
  declare position?: GameTeamPosition;

  @HasOne(() => GameTeamHomeGroup)
  declare homeGroup?: GameTeamHomeGroup;

  @HasMany(() => GameLocationTeamVisibility)
  declare locationVisibility?: GameLocationTeamVisibility[];

  @HasMany(() => GameChallengeInstance)
  declare challengeInstances?: GameChallengeInstance[];
}

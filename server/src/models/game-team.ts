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
import { GameNode } from "./game-node.ts";
import { GameParticipant } from "./game-participant.ts";
import { GameTeamHomeGroup } from "./game-team-home-group.ts";
import { GameTeamPosition } from "./game-team-position.ts";
import { GameTile } from "./game-tile.ts";
import { GameTilePlacement } from "./game-tile-placement.ts";
import { TeamDefinition } from "./team-definition.ts";

/**
 * Compact snapshot entry written into `game_teams.final_yaku_keys`
 * when the team completes their hand. Mirrors
 * `AnalyzedWait.yaku[i]` from the scoring module (TDD §3.9) and is
 * sized so the summary endpoint can render the breakdown without
 * re-running `analyzeHand`.
 */
export interface FinalYakuEntry {
  name: string;
  han: number;
}

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

  /**
   * Phase J — TDD §3.10. Stamped when the team runs `CLAIM_WIN`; left
   * NULL on the timer end path (incomplete teams still get
   * `final_*` = 0 stamped by the GAME_END scheduler handler). The
   * "hand-completed lock" gate keys off this column being non-null.
   */
  @Column({ type: DataType.DATE, allowNull: true })
  declare handCompletedAt: Date | null;

  /**
   * Phase J — `game_tiles.id` of the station tile the team claimed as
   * their winning 14th tile. NULL until `CLAIM_WIN`. `ON DELETE
   * RESTRICT` at the DB level so a completed game never loses the
   * pointer to its trophy tile.
   */
  @ForeignKey(() => GameTile)
  @Column({ type: DataType.UUID, allowNull: true })
  declare winningTileId: string | null;

  @BelongsTo(() => GameTile, "winningTileId")
  declare winningTile?: GameTile;

  /**
   * Phase J — denormalized `game_nodes.id` where the winning tile was
   * claimed, so the summary endpoint doesn't have to walk placements.
   */
  @ForeignKey(() => GameNode)
  @Column({ type: DataType.UUID, allowNull: true })
  declare winningNodeId: string | null;

  @BelongsTo(() => GameNode, "winningNodeId")
  declare winningNode?: GameNode;

  /**
   * Phase J snapshot fields. Filled in for completed teams at
   * `CLAIM_WIN` time and for incomplete teams at `GAME_ENDED` time
   * (with `final_*` = 0 + `final_yaku_keys` = NULL). The multi-column
   * CHECK requires `final_*` to all be set whenever
   * `hand_completed_at` is non-null.
   */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare finalHan: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare finalFu: number | null;

  @Column({ type: DataType.INTEGER, allowNull: true })
  declare finalPoints: number | null;

  @Column({ type: DataType.JSONB, allowNull: true })
  declare finalYakuKeys: FinalYakuEntry[] | null;

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

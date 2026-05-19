import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Lobby } from "./lobby.ts";
import { User } from "./user.ts";

@Table({ tableName: "lobby_team_assignments" })
export class LobbyTeamAssignment extends BaseModel {
  @ForeignKey(() => Lobby)
  @Column({ type: DataType.UUID, allowNull: false })
  declare lobbyId: string;

  @BelongsTo(() => Lobby)
  declare lobby?: Lobby;

  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare userId: string;

  @BelongsTo(() => User)
  declare user?: User;

  /**
   * Game team index 1–4 (maps to team_definitions at start).
   * Multiple users in the same lobby may share the same value.
   * null = random pool at game start.
   */
  @Column({ type: DataType.INTEGER, allowNull: true })
  declare teamSlot: number | null;
}

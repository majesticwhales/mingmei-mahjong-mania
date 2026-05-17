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

@Table({ tableName: "lobby_members" })
export class LobbyMember extends BaseModel {
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

  @Column({ type: DataType.DATE, allowNull: false })
  declare joinedAt: Date;
}

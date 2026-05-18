import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  HasMany,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { LobbyMember } from "./lobby-member.ts";
import { LobbyTeamAssignment } from "./lobby-team-assignment.ts";
import { MapTemplate } from "./map-template.ts";
import { User } from "./user.ts";

export type LobbyStatus = "waiting" | "starting" | "closed";
export type TeamAssignmentMode = "pick" | "random" | "mixed";

@Table({ tableName: "lobbies" })
export class Lobby extends BaseModel {
  @ForeignKey(() => User)
  @Column({ type: DataType.UUID, allowNull: false })
  declare hostUserId: string;

  @BelongsTo(() => User, "hostUserId")
  declare host?: User;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "waiting",
  })
  declare status: LobbyStatus;

  @ForeignKey(() => MapTemplate)
  @Column({ type: DataType.UUID, allowNull: false })
  declare mapTemplateId: string;

  @BelongsTo(() => MapTemplate)
  declare mapTemplate?: MapTemplate;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare gameDurationSeconds: number;

  @Column({ type: DataType.INTEGER, allowNull: false })
  declare visibilityPhaseIntervalSeconds: number;

  @Column({
    type: DataType.STRING(16),
    allowNull: false,
    defaultValue: "pick",
  })
  declare teamAssignmentMode: TeamAssignmentMode;

  @Column({ type: DataType.INTEGER, allowNull: false, defaultValue: 4 })
  declare minPlayersToStart: number;

  @Column({ type: DataType.DATE, allowNull: true })
  declare configUpdatedAt: Date | null;

  @HasMany(() => LobbyMember)
  declare members?: LobbyMember[];

  @HasMany(() => LobbyTeamAssignment)
  declare teamAssignments?: LobbyTeamAssignment[];
}

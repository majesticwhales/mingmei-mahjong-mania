import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { Lobby } from "./lobby.ts";

/**
 * Host-managed notification schedule. Rows are copied into `game_scheduled_jobs`
 * (`job_type = 'NOTIFICATION'`) at game start; the engine never reads this table directly.
 */
@Table({ tableName: "lobby_notifications" })
export class LobbyNotification extends BaseModel {
  @ForeignKey(() => Lobby)
  @Column({ type: DataType.UUID, allowNull: false })
  declare lobbyId: string;

  @BelongsTo(() => Lobby)
  declare lobby?: Lobby;

  /** Offset in seconds from `games.started_at`. Non-negative (DB check). */
  @Column({ type: DataType.INTEGER, allowNull: false })
  declare atSeconds: number;

  /** Opaque template key. Catalog of valid templates is a rule-layer concern. */
  @Column({ type: DataType.STRING(64), allowNull: false })
  declare template: string;

  /** Optional template-specific payload (e.g. `{ minutesLeft: 10 }`). */
  @Column({ type: DataType.JSONB, allowNull: true })
  declare data: Record<string, unknown> | null;
}

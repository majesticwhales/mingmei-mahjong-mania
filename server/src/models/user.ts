// server/src/models/user.ts
import {
    Column,
    DataType,
    DefaultScope,
    HasMany,
    Scopes,
    Table,
} from "sequelize-typescript";
import { BaseModel } from "./base.ts";
import { MediaAsset } from "./media-asset.ts";

export type UserRole = "user" | "admin";

@DefaultScope(() => ({
    attributes: { exclude: ["passwordHash"] },
}))
@Scopes(() => ({
    withPassword: {
        attributes: { include: ["passwordHash"] },
    },
}))
@Table({ tableName: "users" })
export class User extends BaseModel {
    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    declare email: string;

    @Column({
        field: "password_hash",
        type: DataType.STRING,
        allowNull: false,
    })
    declare passwordHash: string;

    @Column({ type: DataType.STRING, allowNull: false, unique: true })
    declare username: string;

    /**
     * Coarse account type used for admin gating. Backed by a CHECK
     * constraint on `users.role` (see migration
     * `20260608010000-add-user-role.cjs`). Every existing and newly
     * registered account defaults to `'user'`; promotion to `'admin'`
     * is a manual data step.
     */
    @Column({
        type: DataType.STRING(8),
        allowNull: false,
        defaultValue: "user",
    })
    declare role: UserRole;

    @HasMany(() => MediaAsset)
    declare mediaAssets?: MediaAsset[];
}
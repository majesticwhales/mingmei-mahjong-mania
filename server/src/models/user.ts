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

    @HasMany(() => MediaAsset)
    declare mediaAssets?: MediaAsset[];
}
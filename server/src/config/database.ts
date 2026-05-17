import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { User } from "../models/user.ts";

export const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: "postgres",
  models: [User],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});
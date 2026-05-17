import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { TeamDefinition } from "../models/team-definition.ts";
import { User } from "../models/user.ts";

export const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: "postgres",
  models: [User, TeamDefinition],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});
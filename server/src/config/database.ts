import "reflect-metadata";
import { Sequelize } from "sequelize-typescript";
import { MapTemplate } from "../models/map-template.ts";
import { MapTemplateEdge } from "../models/map-template-edge.ts";
import { MapTemplateNode } from "../models/map-template-node.ts";
import { TeamDefinition } from "../models/team-definition.ts";
import { User } from "../models/user.ts";

export const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: "postgres",
  models: [User, TeamDefinition, MapTemplate, MapTemplateNode, MapTemplateEdge],
  logging: process.env.NODE_ENV === "development" ? console.log : false,
});
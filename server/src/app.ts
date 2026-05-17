import cors from "cors";
import express from "express";
import { sequelize } from "./config/database";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

app.get("/api/health", async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

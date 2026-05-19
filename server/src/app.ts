import cors from "cors";
import express from "express";
import { sequelize } from "./config/database.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { authRouter } from "./routes/auth.ts";
import { getDefaultNetwork, mapTemplatesRouter } from "./routes/map-templates.ts";

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

/** Default catalog map (TTC 2026) in client `Network` shape + template metadata. */
app.get("/api/network", getDefaultNetwork);

app.use("/api/auth", authRouter);
app.use("/api/map-templates", mapTemplatesRouter);

app.use(errorHandler);

import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { sequelize } from "./config/database";
import { getDefaultNetwork, mapTemplatesRouter } from "./routes/map-templates.ts";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from Express!" });
});

/** Default catalog map (TTC 2026) in client `Network` shape + template metadata. */
app.get("/api/network", getDefaultNetwork);

app.use("/api/map-templates", mapTemplatesRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.get("/api/health", async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", database: "disconnected" });
  }
});

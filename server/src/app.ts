import cors from "cors";
import express from "express";
import { sequelize } from "./config/database.ts";
import { errorHandler } from "./middleware/error-handler.ts";
import { requireAuth } from "./middleware/require-auth.ts";
import { authProtectedRouter, authPublicRouter } from "./routes/auth.ts";
import { gamesRouter } from "./routes/games.ts";
import { lobbiesRouter } from "./routes/lobbies.ts";
import { getDefaultNetwork, mapTemplatesRouter } from "./routes/map-templates.ts";
import { mountClientStatic } from "./static-client.ts";

export const app = express();

app.use(cors());
app.use(express.json());

// --- Public (no auth) ---
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

app.get("/api/network", getDefaultNetwork);

app.use("/api/auth", authPublicRouter);
app.use("/api/map-templates", mapTemplatesRouter);

// --- Protected (Bearer JWT): path, requireAuth, router ---
app.use("/api/auth", requireAuth, authProtectedRouter);
app.use("/api/lobbies", requireAuth, lobbiesRouter);
app.use("/api/games", requireAuth, gamesRouter);

mountClientStatic(app);

app.use(errorHandler);

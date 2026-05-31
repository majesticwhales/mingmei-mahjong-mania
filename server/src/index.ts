import http from "node:http";
import "./env.ts";
import "reflect-metadata";
import { app } from "./app.ts";
import { sequelize } from "./config/database.ts";
import { SocketBroadcaster } from "./socket/broadcaster.ts";
import { setBroadcaster } from "./socket/broadcaster-registry.ts";
import { createSocketServer } from "./socket/server.ts";

const port = Number(process.env.PORT) || 3001;

async function main() {
  await sequelize.authenticate();
  console.log("Database connection established.");

  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  setBroadcaster(new SocketBroadcaster(io));

  httpServer.listen(port, () => {
    console.log(`API + Socket.IO running on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

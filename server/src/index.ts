import http from "node:http";
import "./env.ts";
import "reflect-metadata";
import { app } from "./app.ts";
import { sequelize } from "./config/database.ts";
import { QueueWorker, setQueueWorker } from "./queue/worker.ts";
import {
  SchedulerWorker,
  setSchedulerWorker,
} from "./scheduler/worker.ts";
import { SocketBroadcaster } from "./socket/broadcaster.ts";
import { setBroadcaster } from "./socket/broadcaster-registry.ts";
import { createSocketServer } from "./socket/server.ts";

const port = Number(process.env.PORT) || 3001;

function requireEnv(name: string): void {
  if (!process.env[name]?.trim()) {
    throw new Error(
      `${name} is not set. Add it to server/.env (see .env.example).`,
    );
  }
}

async function main() {
  requireEnv("JWT_SECRET");
  await sequelize.authenticate();
  console.log("Database connection established.");

  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  setBroadcaster(new SocketBroadcaster(io));

  // Workers register themselves with their respective process-level
  // singletons so the socket handler (`triggerGameQueue`) and future
  // call sites can reach them without explicit plumbing.
  const queueWorker = new QueueWorker();
  setQueueWorker(queueWorker);
  queueWorker.start();

  const schedulerWorker = new SchedulerWorker();
  setSchedulerWorker(schedulerWorker);
  schedulerWorker.start();

  httpServer.listen(port, () => {
    console.log(`API + Socket.IO running on http://localhost:${port}`);
  });

  // Graceful shutdown: stop accepting new connections, then drain the
  // workers (each stop() waits for the current tick/loop), then close
  // the DB pool. We bind the same handler to SIGINT and SIGTERM so
  // both `Ctrl+C` and container orchestrators get a clean exit.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}; shutting down…`);
    try {
      await Promise.all([queueWorker.stop(), schedulerWorker.stop()]);
      io.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      await sequelize.close();
      process.exit(0);
    } catch (err) {
      console.error("Error during shutdown:", err);
      process.exit(1);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

import path from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";

const serverRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** Default path when client is built alongside server in the monorepo. */
const defaultClientDist = path.resolve(serverRoot, "..", "client", "dist");

/**
 * Serve the Vite production build in production so phones hit one origin for
 * HTTP, REST, and Socket.IO (see `client/src/transport/socketClient.ts`).
 */
export function mountClientStatic(app: Express): void {
  if (process.env.NODE_ENV !== "production") return;

  const clientDist = process.env.CLIENT_DIST ?? defaultClientDist;

  app.use(express.static(clientDist, { index: false }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next(err);
    });
  });
}

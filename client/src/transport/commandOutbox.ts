import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface OutboxRow {
  clientCommandId: string;
  gameId: string;
  gameTeamId: string;
  commandType: string;
  payload: Record<string, unknown>;
  enqueuedAt: number;
  status: "pending" | "in_flight" | "acked" | "rejected" | "expired";
  attempts: number;
  lastError?: { code: string; message: string };
}

interface CommandOutboxDB extends DBSchema {
  commandOutbox: {
    key: string;
    value: OutboxRow;
    indexes: { byGameAndEnqueuedAt: [string, number] };
  };
}

const DB_NAME = "mmm.client.v1";
const STORE = "commandOutbox";
const EXPIRY_MS = 24 * 60 * 60 * 1000;

let dbPromise: Promise<IDBPDatabase<CommandOutboxDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<CommandOutboxDB>(DB_NAME, 1, {
      upgrade(database) {
        const store = database.createObjectStore(STORE, {
          keyPath: "clientCommandId",
        });
        store.createIndex("byGameAndEnqueuedAt", ["gameId", "enqueuedAt"]);
      },
    });
  }
  return dbPromise;
}

export async function hydrateOutbox(): Promise<OutboxRow[]> {
  const db = await getDb();
  const now = Date.now();
  const rows = await db.getAll(STORE);
  const active: OutboxRow[] = [];
  for (const row of rows) {
    if (now - row.enqueuedAt > EXPIRY_MS) {
      await db.delete(STORE, row.clientCommandId);
      continue;
    }
    if (row.status === "in_flight") {
      active.push({ ...row, status: "pending" });
      await db.put(STORE, { ...row, status: "pending" });
    } else if (row.status === "pending") {
      active.push(row);
    }
  }
  return active.sort((a, b) => a.enqueuedAt - b.enqueuedAt);
}

export async function enqueueRow(row: OutboxRow) {
  const db = await getDb();
  await db.put(STORE, row);
}

export async function updateRow(row: OutboxRow) {
  const db = await getDb();
  if (row.status === "acked" || row.status === "rejected" || row.status === "expired") {
    await db.delete(STORE, row.clientCommandId);
    return;
  }
  await db.put(STORE, row);
}

export async function listForGame(gameId: string) {
  const db = await getDb();
  return db.getAllFromIndex(STORE, "byGameAndEnqueuedAt", IDBKeyRange.bound([gameId, 0], [gameId, Number.MAX_SAFE_INTEGER]));
}

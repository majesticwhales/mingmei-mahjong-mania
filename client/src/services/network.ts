import type { Network } from "../data/types";

interface NetworkApiResponse {
  template: {
    id: string;
    name: string;
    description: string | null;
    nodeCount: number;
  };
  lines: Network["lines"];
  stations: Network["stations"];
}

/**
 * Loads the default map template network from the API (seeded TTC 2026).
 * Vite proxies `/api` → `http://localhost:3001` in dev.
 */
export async function getNetwork(): Promise<Network> {
  const res = await fetch("/api/network");
  if (!res.ok) {
    throw new Error(`Failed to load network (${res.status})`);
  }
  const data = (await res.json()) as NetworkApiResponse;
  return { lines: data.lines, stations: data.stations };
}

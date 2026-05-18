import { network } from "../data/ttc2026";
import type { Network } from "../data/types";

/**
 * Returns the full subway network. Currently resolves a static dataset bundled
 * with the client. Swap the implementation to `fetch("/api/network")` once the
 * server exposes the same JSON shape.
 */
export async function getNetwork(): Promise<Network> {
  return network;
}

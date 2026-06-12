import { useCallback, useEffect, useRef, useState } from "react";
import { HttpError } from "../../transport/httpError";
import { restClient } from "../../transport/restClient";
import { onSocketEvent } from "../../transport/socketClient";
import type { NodeViewDto } from "../../wire/nodeView";
import { useGame } from "./hooks";

export interface UseNodeViewResult {
  /**
   * Latest `NodeViewDto` for the requested `(gameId, nodeId)` pair.
   * `null` before the first fetch lands, when `nodeId` is `null`, or
   * when the game state isn't `"active"` (no game = no node to view).
   * During a background refresh triggered by an inbound `game.event`,
   * the *previous* result stays here unchanged until the new one
   * lands — that's the no-flicker contract.
   */
  data: NodeViewDto | null;
  /** True while a fetch is in flight. Set on every refresh, including the background ones. */
  loading: boolean;
  /**
   * Most recent fetch error, if any. Cleared on each new fetch
   * attempt. A successful refresh after an error clears it; a failed
   * refresh replaces a prior error with the new one (oldest error
   * loses).
   */
  error: HttpError | null;
  /**
   * Imperative refresh — kicks off a fetch using the current
   * `(gameId, nodeId)` pair. No-op when `nodeId` is `null` or the
   * game isn't active. Returns synchronously; observe via `loading`
   * and `data` like any other refresh.
   */
  refresh: () => void;
}

/**
 * Phase L §3.14 — per-team node view via `GET /api/games/:id/nodes/:nodeId/view`.
 *
 * Fetches on mount + whenever the `(gameId, nodeId)` pair changes.
 * Subscribes to `game.event` while a `(gameId, nodeId)` is active and
 * triggers a background refresh on every inbound event — keeps the
 * previous result rendered until the new one lands. Passing `null`
 * short-circuits to the empty resting state without firing a request
 * or subscribing to anything, so callers can mount the hook
 * unconditionally and gate on `data`.
 *
 * The hook owns no global cache — every mount of the same
 * `(gameId, nodeId)` pair issues its own request. Cross-mount dedupe
 * is a post-MVP concern (TDD §5.4).
 */
export function useNodeView(nodeId: string | null): UseNodeViewResult {
  const { state } = useGame();
  const gameId = state.status === "active" ? state.id : null;

  const [data, setData] = useState<NodeViewDto | null>(null);
  // Initialise `loading` to match the about-to-fire mount fetch so
  // consumers don't see a `false → true → false` flicker on first
  // render. Lazy initialiser ensures the value is computed exactly
  // once.
  const [loading, setLoading] = useState<boolean>(() =>
    Boolean(gameId && nodeId),
  );
  const [error, setError] = useState<HttpError | null>(null);

  // Monotonic token — every fetch grabs a fresh value and only
  // applies its response when the value still matches. Lets us
  // discard stale responses (e.g. a slow fetch that resolves after
  // a faster refresh, or a fetch that races against an unmount /
  // nodeId change) without touching `AbortController`. The token
  // increments on every fetch *and* on every transition into the
  // "no fetch" state, so an in-flight response is always ignored
  // when the hook is no longer interested.
  const fetchTokenRef = useRef(0);
  const gameIdRef = useRef(gameId);
  const nodeIdRef = useRef(nodeId);
  gameIdRef.current = gameId;
  nodeIdRef.current = nodeId;

  const runFetch = useCallback((clearPrevious: boolean) => {
    const targetGameId = gameIdRef.current;
    const targetNodeId = nodeIdRef.current;
    if (!targetGameId || !targetNodeId) return;
    const token = ++fetchTokenRef.current;
    if (clearPrevious) setData(null);
    setLoading(true);
    setError(null);
    restClient.getNodeView(targetGameId, targetNodeId).then(
      (result) => {
        if (token !== fetchTokenRef.current) return;
        setData(result);
        setLoading(false);
      },
      (err) => {
        if (token !== fetchTokenRef.current) return;
        setError(
          err instanceof HttpError
            ? err
            : new HttpError("unknown_error", String(err), 0),
        );
        setLoading(false);
      },
    );
  }, []);

  // Mount fetch + re-fetch when (gameId, nodeId) changes. Clear the
  // previous data because a new nodeId is a logically different
  // view, so showing stale data while the new one loads would be
  // confusing. Falling back to the "no fetch" state when either id
  // is null bumps the token so any in-flight response is dropped.
  useEffect(() => {
    if (!gameId || !nodeId) {
      fetchTokenRef.current += 1;
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    runFetch(true);
  }, [gameId, nodeId, runFetch]);

  // Subscribe to `game.event` while a fetch target is active and
  // trigger a *background* refresh on every inbound event — pass
  // `clearPrevious=false` so the previous result stays rendered
  // until the new one lands. No-op when the target is unset.
  useEffect(() => {
    if (!gameId || !nodeId) return undefined;
    const unsub = onSocketEvent("game.event", () => {
      runFetch(false);
    });
    return unsub;
  }, [gameId, nodeId, runFetch]);

  const refresh = useCallback(() => {
    runFetch(false);
  }, [runFetch]);

  return { data, loading, error, refresh };
}

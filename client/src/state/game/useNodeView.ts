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
  const targetKey = gameId && nodeId ? `${gameId}|${nodeId}` : null;

  const [data, setData] = useState<NodeViewDto | null>(null);
  // Initialise `loading` to match the about-to-fire mount fetch so
  // consumers don't see a `false → true → false` flicker on first
  // render. Lazy initialiser ensures the value is computed exactly
  // once.
  const [loading, setLoading] = useState<boolean>(() => Boolean(targetKey));
  const [error, setError] = useState<HttpError | null>(null);

  // Tracks the (gameId, nodeId) pair the current `data` was fetched
  // for. Whenever the consumer's target diverges, we adjust state
  // during render (per the React-recommended pattern in
  // [Adjusting state during a render](https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes))
  // so the consumer never observes a frame of stale data from the
  // previous target — and we steer clear of the
  // `react-hooks/set-state-in-effect` lint that fires when an effect
  // calls setState synchronously.
  const [storedKey, setStoredKey] = useState<string | null>(targetKey);

  // Monotonic token — every fetch grabs a fresh value and only
  // applies its response when the value still matches. Lets us
  // discard stale responses (e.g. a slow fetch that resolves after
  // a faster refresh, or a fetch that races against an unmount /
  // nodeId change) without touching `AbortController`. The token
  // increments on every fetch *and* on every transition into the
  // "no fetch" state, so an in-flight response is always ignored
  // when the hook is no longer interested.
  const fetchTokenRef = useRef(0);

  if (storedKey !== targetKey) {
    setStoredKey(targetKey);
    setData(null);
    setLoading(Boolean(targetKey));
    setError(null);
    // Token bump (to invalidate any in-flight stale fetch) is
    // deferred to the effect below — mutating refs during render
    // trips the `react-hooks/refs` lint, and we don't need it here
    // anyway because the effect will fire on this same commit (its
    // deps changed) and either bump the token (null branch) or call
    // `runFetch` (which bumps it internally) before any stale
    // response can race the new state.
  }

  const runFetch = useCallback(() => {
    if (!gameId || !nodeId) return;
    const token = ++fetchTokenRef.current;
    restClient.getNodeView(gameId, nodeId).then(
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
  }, [gameId, nodeId]);

  // Mount + re-fetch when the (gameId, nodeId) pair changes. The
  // render-time adjustment above already cleared previous data and
  // flipped loading on, so the effect just needs to fire the actual
  // network request — no synchronous setState in the body. Ref
  // mutation (the token bump on transitions into the "no fetch"
  // state) is allowed inside effects, which is where we drop it.
  useEffect(() => {
    if (!gameId || !nodeId) {
      fetchTokenRef.current += 1;
      return;
    }
    runFetch();
  }, [gameId, nodeId, runFetch]);

  // Subscribe to `game.event` while a fetch target is active and
  // trigger a *background* refresh on every inbound event — `data`
  // stays put while `loading` flips back on so the consumer never
  // sees a blank state. setState in an external-subscription
  // callback is the explicitly-allowed exception in the
  // set-state-in-effect rule.
  useEffect(() => {
    if (!gameId || !nodeId) return undefined;
    return onSocketEvent("game.event", () => {
      setLoading(true);
      setError(null);
      runFetch();
    });
  }, [gameId, nodeId, runFetch]);

  const refresh = useCallback(() => {
    if (!gameId || !nodeId) return;
    setLoading(true);
    setError(null);
    runFetch();
  }, [gameId, nodeId, runFetch]);

  return { data, loading, error, refresh };
}

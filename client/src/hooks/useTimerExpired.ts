import { useEffect, useState } from "react";

/**
 * Tracks whether `endsAt` has passed. Updates once per second while
 * `enabled` so callers can react to timer expiry without calling
 * impure time functions during render.
 */
export function useTimerExpired(
  endsAt: string | null | undefined,
  enabled = true,
): boolean {
  const endsAtMs = endsAt ? new Date(endsAt).getTime() : null;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || endsAtMs == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [enabled, endsAtMs]);

  if (!enabled || endsAtMs == null) return false;
  return endsAtMs <= now;
}

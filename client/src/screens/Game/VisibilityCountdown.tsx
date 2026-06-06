import { useEffect, useRef, useState } from "react";

interface Props {
  nextVisibilityChangeAt: string | null;
  onElapsed?: () => void;
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VisibilityCountdown({ nextVisibilityChangeAt, onElapsed }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const elapsedRef = useRef(false);

  const targetMs = nextVisibilityChangeAt
    ? new Date(nextVisibilityChangeAt).getTime()
    : null;
  const remaining = targetMs != null ? targetMs - now : null;

  useEffect(() => {
    elapsedRef.current = false;
  }, [nextVisibilityChangeAt]);

  useEffect(() => {
    if (targetMs == null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [targetMs]);

  useEffect(() => {
    if (remaining == null || remaining > 0) return;
    if (elapsedRef.current) return;
    elapsedRef.current = true;
    onElapsed?.();
  }, [remaining, onElapsed]);

  if (remaining == null) return null;
  return (
    <p className="game-visibility">
      Next visibility: {formatRemaining(remaining)}
    </p>
  );
}

import { useEffect, useState } from "react";

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
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!nextVisibilityChangeAt) {
      setRemaining(null);
      return;
    }
    let elapsedFired = false;
    const tick = () => {
      const nextRemaining = new Date(nextVisibilityChangeAt).getTime() - Date.now();
      setRemaining(nextRemaining);
      if (nextRemaining <= 0 && !elapsedFired) {
        elapsedFired = true;
        onElapsed?.();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nextVisibilityChangeAt, onElapsed]);

  if (remaining == null) return null;
  return (
    <p className="game-visibility">
      Next visibility: {formatRemaining(remaining)}
    </p>
  );
}

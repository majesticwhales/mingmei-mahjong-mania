import { useEffect, useState } from "react";

interface Props {
  nextVisibilityChangeAt: string | null;
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function VisibilityCountdown({ nextVisibilityChangeAt }: Props) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!nextVisibilityChangeAt) {
      setRemaining(null);
      return;
    }
    const tick = () => setRemaining(new Date(nextVisibilityChangeAt).getTime() - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [nextVisibilityChangeAt]);

  if (remaining == null) return null;
  return (
    <p className="game-visibility">
      Next visibility: {formatRemaining(remaining)}
    </p>
  );
}

import { useEffect, useState } from "react";

interface Props {
  endsAt: string;
  ended?: boolean;
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function GameTimer({ endsAt, ended = false }: Props) {
  const [remaining, setRemaining] = useState(() => new Date(endsAt).getTime() - Date.now());

  useEffect(() => {
    if (ended) return;
    const timer = setInterval(() => {
      setRemaining(new Date(endsAt).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt, ended]);

  if (ended) {
    return <span className="game-timer game-timer--ended">Game over</span>;
  }

  return <span className="game-timer">Timer {formatRemaining(remaining)}</span>;
}

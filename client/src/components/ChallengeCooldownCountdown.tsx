import { useEffect, useState } from "react";

interface Props {
  cooldownUntil: string;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function ChallengeCooldownCountdown({ cooldownUntil }: Props) {
  const endsAtMs = new Date(cooldownUntil).getTime();
  const [remainingMs, setRemainingMs] = useState(() => endsAtMs - Date.now());

  useEffect(() => {
    const tick = () => setRemainingMs(endsAtMs - Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAtMs]);

  return (
    <p className="station-panel__challenge-cooldown">
      Challenge on cooldown — unlocks in{" "}
      <time dateTime={cooldownUntil}>{formatCountdown(remainingMs)}</time>
    </p>
  );
}

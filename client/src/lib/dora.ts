import type { TileDto } from "../wire/projection";

const SUIT_CYCLE_LENGTH: Record<string, number> = {
  man: 9,
  pin: 9,
  sou: 9,
  wind: 4,
  dragon: 3,
};

export interface DoraTileType {
  suit: string;
  rank: number;
}

export function indicatorToDoraTileType(indicator: DoraTileType): DoraTileType {
  const length = SUIT_CYCLE_LENGTH[indicator.suit];
  if (length == null) {
    throw new Error(`Unrecognised suit "${indicator.suit}" for dora indicator`);
  }
  if (!Number.isInteger(indicator.rank) || indicator.rank < 1 || indicator.rank > length) {
    throw new Error(
      `Invalid rank ${indicator.rank} for ${indicator.suit} dora indicator (expected 1..${length})`,
    );
  }
  return { suit: indicator.suit, rank: (indicator.rank % length) + 1 };
}

export function doraTileFromIndicator(indicator: TileDto): DoraTileType {
  return indicatorToDoraTileType({ suit: indicator.suit, rank: indicator.rank });
}

const WIND_LABELS = ["East", "South", "West", "North"] as const;
const DRAGON_LABELS = ["Red", "White", "Green"] as const;
const NUMBERED_SUIT_LABELS: Record<string, string> = {
  man: "Character",
  pin: "Circle",
  sou: "Bamboo",
};

export function doraTileLabel(dora: DoraTileType): string {
  const numberedLabel = NUMBERED_SUIT_LABELS[dora.suit];
  if (numberedLabel) return `${dora.rank} ${numberedLabel}`;
  if (dora.suit === "wind") return `${WIND_LABELS[dora.rank - 1] ?? "—"} Wind`;
  if (dora.suit === "dragon") return `${DRAGON_LABELS[dora.rank - 1] ?? "—"} Dragon`;
  return "—";
}

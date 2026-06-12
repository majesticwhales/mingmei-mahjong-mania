/** Station codes that hold mahjong tiles in the live game (23 × 3 = 69). */
export const TILE_STATION_CODES = [
  "high-park",
  "dufferin",
  "spadina",
  "dupont",
  "bathurst",
  "yorkdale",
  "museum",
  "queens-park",
  "st-andrew",
  "union",
  "king",
  "queen",
  "college",
  "bloor-yonge",
  "bay",
  "st-clair",
  "eglinton",
  "aga-khan",
  "golden-mile",
  "warden",
  "main-street",
  "greenwood",
  "broadview",
] as const;

export type TileStationCode = (typeof TILE_STATION_CODES)[number];

export const TILE_STATION_COUNT = TILE_STATION_CODES.length;

export const TILE_STATION_CODE_SET = new Set<string>(TILE_STATION_CODES);

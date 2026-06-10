/** Station codes that hold three mahjong tiles in the live game. */
export const TILE_STATION_CODES = [
  "high-park",
  "dufferin",
  "spadina",
  "dupont",
  "st-clair-west",
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

export const TILE_STATION_CODE_SET = new Set<string>(TILE_STATION_CODES);

export const TILES_PER_STATION = 3;

export function isTileStation(code: string): code is TileStationCode {
  return TILE_STATION_CODE_SET.has(code);
}

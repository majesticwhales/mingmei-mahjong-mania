import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";

const TILE_ASSET_BASE_PATH = "/vendor/riichi-mahjong-tiles-regular";
const WIND_LABELS = ["East", "South", "West", "North"] as const;
const WIND_TILE_FILES = ["Ton", "Nan", "Shaa", "Pei"] as const;

export function windRankLabel(rank: number): string {
  return WIND_LABELS[rank - 1] ?? "—";
}

export function windRankImagePath(rank: number): string {
  const file = WIND_TILE_FILES[rank - 1];
  return file ? `${TILE_ASSET_BASE_PATH}/${file}.svg` : TILE_BACK_IMAGE_PATH;
}

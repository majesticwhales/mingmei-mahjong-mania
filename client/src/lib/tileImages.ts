import type { TileDto } from "../wire/projection";
import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";

const TILE_ASSET_BASE_PATH = "/vendor/riichi-mahjong-tiles-regular";

function numberedTileFile(suit: string, rank: number, isRedFive: boolean) {
  const prefix =
    suit === "man" ? "Man" : suit === "pin" ? "Pin" : suit === "sou" ? "Sou" : null;
  if (!prefix) return null;
  if (rank === 5 && isRedFive) return `${TILE_ASSET_BASE_PATH}/${prefix}5-Dora.svg`;
  return `${TILE_ASSET_BASE_PATH}/${prefix}${rank}.svg`;
}

function honorTileFile(suit: string, rank: number) {
  if (suit === "wind") {
    return ["Ton", "Nan", "Shaa", "Pei"][rank - 1]
      ? `${TILE_ASSET_BASE_PATH}/${["Ton", "Nan", "Shaa", "Pei"][rank - 1]}.svg`
      : null;
  }
  if (suit === "dragon") {
    return ["Chun", "Haku", "Hatsu"][rank - 1]
      ? `${TILE_ASSET_BASE_PATH}/${["Chun", "Haku", "Hatsu"][rank - 1]}.svg`
      : null;
  }
  return null;
}

export function tileImagePath(tile: TileDto | null | undefined, faceDown = false) {
  if (!tile || faceDown) return TILE_BACK_IMAGE_PATH;
  return (
    numberedTileFile(tile.suit, tile.rank, tile.isRedFive) ??
    honorTileFile(tile.suit, tile.rank) ??
    TILE_BACK_IMAGE_PATH
  );
}

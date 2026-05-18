export interface RiichiTileKind {
  id: string;
  label: string;
  imagePath: string;
  redFiveImagePath?: string;
}

export interface RiichiTileCopy extends RiichiTileKind {
  copy: number;
  copyId: string;
}

const TILE_ASSET_BASE_PATH = "/vendor/riichi-mahjong-tiles-regular";

const suitTiles = (
  suitId: "man" | "pin" | "sou",
  suitLabel: "Character" | "Circle" | "Bamboo",
  filePrefix: "Man" | "Pin" | "Sou",
): RiichiTileKind[] =>
  Array.from({ length: 9 }, (_, index) => {
    const rank = index + 1;
    return {
      id: `${suitId}-${rank}`,
      label: `${rank} ${suitLabel}`,
      imagePath: `${TILE_ASSET_BASE_PATH}/${filePrefix}${rank}.svg`,
      redFiveImagePath:
        rank === 5 ? `${TILE_ASSET_BASE_PATH}/${filePrefix}5-Dora.svg` : undefined,
    };
  });

export const RIICHI_TILE_KINDS: readonly RiichiTileKind[] = [
  ...suitTiles("man", "Character", "Man"),
  ...suitTiles("pin", "Circle", "Pin"),
  ...suitTiles("sou", "Bamboo", "Sou"),
  {
    id: "wind-east",
    label: "East Wind",
    imagePath: `${TILE_ASSET_BASE_PATH}/Ton.svg`,
  },
  {
    id: "wind-south",
    label: "South Wind",
    imagePath: `${TILE_ASSET_BASE_PATH}/Nan.svg`,
  },
  {
    id: "wind-west",
    label: "West Wind",
    imagePath: `${TILE_ASSET_BASE_PATH}/Shaa.svg`,
  },
  {
    id: "wind-north",
    label: "North Wind",
    imagePath: `${TILE_ASSET_BASE_PATH}/Pei.svg`,
  },
  {
    id: "dragon-white",
    label: "White Dragon",
    imagePath: `${TILE_ASSET_BASE_PATH}/Haku.svg`,
  },
  {
    id: "dragon-green",
    label: "Green Dragon",
    imagePath: `${TILE_ASSET_BASE_PATH}/Hatsu.svg`,
  },
  {
    id: "dragon-red",
    label: "Red Dragon",
    imagePath: `${TILE_ASSET_BASE_PATH}/Chun.svg`,
  },
];

export const RIICHI_TILE_WALL: readonly RiichiTileCopy[] = Array.from(
  { length: 4 },
  (_, copyIndex) =>
    RIICHI_TILE_KINDS.map((tile) => {
      const copy = copyIndex + 1;
      const redFiveImagePath = copy === 1 ? tile.redFiveImagePath : undefined;

      return {
        ...tile,
        label: redFiveImagePath ? `Red ${tile.label}` : tile.label,
        imagePath: redFiveImagePath ?? tile.imagePath,
        copy,
        copyId: `${tile.id}-${copy}`,
      };
    }),
).flat();

export const getStationTile = (
  stations: readonly { id: string }[],
  stationId: string,
  tileWall: readonly RiichiTileCopy[] = RIICHI_TILE_WALL,
): RiichiTileCopy | null => {
  const stationIndex = stations.findIndex((station) => station.id === stationId);
  return stationIndex >= 0 ? tileWall[stationIndex] ?? null : null;
};

export const getRemainingTileGroups = (
  assignedTileCount: number,
  tileWall: readonly RiichiTileCopy[] = RIICHI_TILE_WALL,
): readonly RiichiTileCopy[][] => {
  const remainingTiles = tileWall.slice(assignedTileCount);
  return Array.from({ length: 4 }, (_, groupIndex) =>
    remainingTiles.slice(groupIndex * 13, groupIndex * 13 + 13),
  );
};

export const shuffleRiichiTileWall = (): RiichiTileCopy[] => {
  const shuffledWall = [...RIICHI_TILE_WALL];

  for (let index = shuffledWall.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffledWall[index], shuffledWall[swapIndex]] = [
      shuffledWall[swapIndex],
      shuffledWall[index],
    ];
  }

  return shuffledWall;
};

import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TILE_BACK_IMAGE_PATH } from "../data/riichiTiles";
import { TILE_STATION_CODES } from "../data/tileStations";
import type { Network, Station } from "../data/types";
import type { MapNodeDto, MapNodeTileDto, TileDto } from "../wire/projection";
import { SubwaySvg } from "./SubwaySvg";

const TILE_STATION_CODE = TILE_STATION_CODES[0]!;

function station(overrides: Partial<Station> = {}): Station {
  return {
    id: "node-1",
    code: TILE_STATION_CODE,
    name: "Tile Stop",
    x: 100,
    y: 200,
    lineIds: ["1"],
    isInterchange: false,
    ...overrides,
  };
}

function network(stations: Station[] = [station()]): Network {
  return {
    lines: [
      {
        id: "1",
        name: "Line 1",
        shortName: "1",
        color: "#fdb813",
        stationIds: stations.map((s) => s.id),
      },
    ],
    stations,
  };
}

function tile(
  overrides: Partial<TileDto> & { suit: string; rank: number; copyIndex: number },
): TileDto {
  return {
    instanceId: `${overrides.suit}-${overrides.rank}-${overrides.copyIndex}`,
    displayName: `${overrides.suit}${overrides.rank}`,
    isRedFive: false,
    ...overrides,
  };
}

function makeNode(
  tiles: MapNodeTileDto[],
  overrides: Partial<MapNodeDto> = {},
): MapNodeDto {
  return {
    id: "node-1",
    code: TILE_STATION_CODE,
    name: "Tile Stop",
    coordinateX: 100,
    coordinateY: 200,
    lineIds: ["1"],
    labelAnchor: "n",
    labelRotate: null,
    isInterchange: false,
    latitude: 0,
    longitude: 0,
    tiles,
    ...overrides,
  };
}

describe("SubwaySvg per-slot rendering (Phase L §3.13)", () => {
  it("renders each MapNodeTileDto.visible=true entry face-up with its tile image", () => {
    const tiles: MapNodeTileDto[] = [
      { slotIndex: 0, tile: tile({ suit: "pin", rank: 5, copyIndex: 0 }), visible: true, locked: false },
      { slotIndex: 1, tile: tile({ suit: "sou", rank: 9, copyIndex: 0 }), visible: true, locked: false },
      { slotIndex: 2, tile: tile({ suit: "man", rank: 3, copyIndex: 0 }), visible: true, locked: false },
    ];

    const { container } = render(
      <SubwaySvg
        network={network()}
        mapNodes={[makeNode(tiles)]}
        selectedStationId={null}
        onSelectStation={vi.fn()}
      />,
    );

    const slots = container.querySelectorAll(".station-marker__tile-slot");
    expect(slots).toHaveLength(3);
    for (const slot of Array.from(slots)) {
      expect(slot.classList.contains("station-marker__tile-slot--hidden")).toBe(false);
      expect(slot.getAttribute("data-locked")).toBeNull();
      const image = slot.querySelector("image");
      expect(image?.getAttribute("href")).not.toBe(TILE_BACK_IMAGE_PATH);
    }
  });

  it("renders MapNodeTileDto.visible=false entries face-down with the hidden modifier", () => {
    const tiles: MapNodeTileDto[] = [
      { slotIndex: 0, tile: tile({ suit: "pin", rank: 5, copyIndex: 0 }), visible: true, locked: false },
      { slotIndex: 1, tile: null, visible: false, locked: false },
      { slotIndex: 2, tile: null, visible: false, locked: false },
    ];

    const { container } = render(
      <SubwaySvg
        network={network()}
        mapNodes={[makeNode(tiles)]}
        selectedStationId={null}
        onSelectStation={vi.fn()}
      />,
    );

    const slots = container.querySelectorAll(".station-marker__tile-slot");
    expect(slots).toHaveLength(3);
    expect(slots[0]!.classList.contains("station-marker__tile-slot--hidden")).toBe(false);
    expect(slots[1]!.classList.contains("station-marker__tile-slot--hidden")).toBe(true);
    expect(slots[2]!.classList.contains("station-marker__tile-slot--hidden")).toBe(true);
    expect(slots[1]!.querySelector("image")?.getAttribute("href")).toBe(TILE_BACK_IMAGE_PATH);
    expect(slots[2]!.querySelector("image")?.getAttribute("href")).toBe(TILE_BACK_IMAGE_PATH);
  });

  it("stamps data-locked='true' on slots whose claim-unlock timer hasn't elapsed", () => {
    // The DB constraint `mapOffset >= claimOffset` means
    // visible-and-locked is unreachable in practice; the achievable
    // combos are (visible, !locked) and (!visible, locked) — early
    // game, claim timer pending, map timer also pending.
    const tiles: MapNodeTileDto[] = [
      { slotIndex: 0, tile: tile({ suit: "pin", rank: 5, copyIndex: 0 }), visible: true, locked: false },
      // Hidden-and-locked: countdown affordance lives on this slot.
      { slotIndex: 1, tile: null, visible: false, locked: true },
      // Hidden-and-unlocked: e.g. `mapOffset = null` (permanently hidden).
      { slotIndex: 2, tile: null, visible: false, locked: false },
    ];

    const { container } = render(
      <SubwaySvg
        network={network()}
        mapNodes={[makeNode(tiles)]}
        selectedStationId={null}
        onSelectStation={vi.fn()}
      />,
    );

    const slots = container.querySelectorAll(".station-marker__tile-slot");
    expect(slots[0]!.getAttribute("data-locked")).toBeNull();
    expect(slots[0]!.classList.contains("station-marker__tile-slot--hidden")).toBe(false);
    expect(slots[1]!.getAttribute("data-locked")).toBe("true");
    expect(slots[1]!.classList.contains("station-marker__tile-slot--hidden")).toBe(true);
    expect(slots[1]!.classList.contains("station-marker__tile-slot--locked")).toBe(true);
    expect(slots[2]!.getAttribute("data-locked")).toBeNull();
    expect(slots[2]!.classList.contains("station-marker__tile-slot--hidden")).toBe(true);
  });

  it("renders visible vacated slots as empty frames without a tile back", () => {
    const tiles: MapNodeTileDto[] = [
      { slotIndex: 0, tile: tile({ suit: "pin", rank: 5, copyIndex: 0 }), visible: true, locked: false },
      { slotIndex: 1, tile: null, visible: true, locked: false },
      { slotIndex: 2, tile: null, visible: false, locked: true },
    ];

    const { container } = render(
      <SubwaySvg
        network={network()}
        mapNodes={[makeNode(tiles)]}
        selectedStationId={null}
        onSelectStation={vi.fn()}
      />,
    );

    const slots = container.querySelectorAll(".station-marker__tile-slot");
    expect(slots[1]!.classList.contains("station-marker__tile-slot--empty")).toBe(true);
    expect(slots[1]!.getAttribute("data-empty")).toBe("true");
    expect(slots[1]!.querySelector("image")).toBeNull();
    expect(slots[2]!.classList.contains("station-marker__tile-slot--locked")).toBe(true);
    expect(slots[2]!.querySelector("image")?.getAttribute("href")).toBe(TILE_BACK_IMAGE_PATH);
  });

  it("falls back to face-down placeholders when the node carries no tiles", () => {
    // E.g. the node is absent from `mapNodes` entirely — server omitted
    // it (impossible today, but the renderer must not crash).
    const { container } = render(
      <SubwaySvg
        network={network()}
        mapNodes={[]}
        selectedStationId={null}
        onSelectStation={vi.fn()}
      />,
    );

    const slots = container.querySelectorAll(".station-marker__tile-slot");
    expect(slots).toHaveLength(3);
    for (const slot of Array.from(slots)) {
      expect(slot.classList.contains("station-marker__tile-slot--hidden")).toBe(true);
      expect(slot.querySelector("image")?.getAttribute("href")).toBe(TILE_BACK_IMAGE_PATH);
    }
  });

  it("hides every slot for nodes that are not tile stations", () => {
    const nonTileStation = station({
      id: "node-2",
      code: "rosedale",
      lineIds: ["1"],
    });
    const tiles: MapNodeTileDto[] = [
      { slotIndex: 0, tile: tile({ suit: "pin", rank: 5, copyIndex: 0 }), visible: true, locked: false },
    ];

    const { container } = render(
      <SubwaySvg
        network={network([nonTileStation])}
        mapNodes={[
          makeNode(tiles, {
            id: nonTileStation.id,
            code: nonTileStation.code,
          }),
        ]}
        selectedStationId={null}
        onSelectStation={vi.fn()}
      />,
    );

    // Non-tile stations render the dot variant — no tile slots at all.
    expect(container.querySelectorAll(".station-marker__tile-slot")).toHaveLength(0);
    expect(container.querySelector(".station-marker__dot")).not.toBeNull();
  });
});

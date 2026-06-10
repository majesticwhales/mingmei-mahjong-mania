import { describe, expect, it } from "vitest";
import { isTileStation, TILE_STATION_CODES } from "./tileStations";

describe("tileStations", () => {
  it("lists exactly 23 tile stations", () => {
    expect(TILE_STATION_CODES).toHaveLength(23);
  });

  it("recognizes known tile station codes", () => {
    expect(isTileStation("bloor-yonge")).toBe(true);
    expect(isTileStation("finch-west")).toBe(false);
  });
});

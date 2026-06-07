import { describe, expect, it } from "vitest";
import { projectionToNetwork } from "./projectionMap";

describe("projectionToNetwork", () => {
  it("maps template station codes in renderMetadata to game node ids", () => {
    const network = projectionToNetwork(
      [
        {
          id: "node-a-uuid",
          code: "alpha",
          name: "Alpha",
          coordinateX: 10,
          coordinateY: 20,
          lineIds: ["1"],
          labelAnchor: "n",
          labelRotate: null,
          isInterchange: false,
          latitude: 0,
          longitude: 0,
        },
        {
          id: "node-b-uuid",
          code: "beta",
          name: "Beta",
          coordinateX: 30,
          coordinateY: 40,
          lineIds: ["1"],
          labelAnchor: "n",
          labelRotate: null,
          isInterchange: false,
          latitude: 0,
          longitude: 0,
        },
      ],
      [
        {
          code: "1",
          name: "Line 1",
          shortName: "1",
          color: "#fff",
          sortOrder: 0,
          renderMetadata: {
            stationIds: ["alpha", "beta"],
            bends: { alpha: [{ x: 15, y: 25 }] },
          },
        },
      ],
      [],
    );

    expect(network.lines[0]?.stationIds).toEqual(["node-a-uuid", "node-b-uuid"]);
    expect(network.lines[0]?.bends).toEqual({
      "node-a-uuid": [{ x: 15, y: 25 }],
    });
  });
});

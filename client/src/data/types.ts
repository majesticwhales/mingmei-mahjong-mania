export type LineId = "1" | "2" | "5";

export interface Point {
  x: number;
  y: number;
}

export type LabelAnchor =
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw";

export interface SubwayLine {
  id: LineId;
  name: string;
  shortName: string;
  color: string;
  stationIds: string[];
  /**
   * Optional bend waypoints inserted AFTER the given station id when drawing the
   * line's path. These are purely visual — they don't appear as stations — and
   * let us shape tight curves (e.g. the Union U-loop) without moving any
   * station coordinates.
   */
  bends?: Record<string, Point[]>;
}

export interface Station {
  id: string;
  name: string;
  /** X coordinate in the SVG viewBox (0..1200). */
  x: number;
  /** Y coordinate in the SVG viewBox (0..800). */
  y: number;
  lineIds: LineId[];
  isInterchange: boolean;
  /**
   * Compass anchor used to place the station label relative to the marker.
   * Falls back to a heuristic (Line 1-only east, others north) when omitted.
   */
  labelAnchor?: LabelAnchor;
  /**
   * Rotation angle for the label in degrees (clockwise positive). Only takes
   * effect when `labelAnchor` is `"n"` or `"s"`; negative values tilt labels
   * up-right, the classic transit-map look for densely-spaced horizontal
   * runs. Omit for upright text.
   */
  labelRotate?: number;
}

export interface Network {
  lines: SubwayLine[];
  stations: Station[];
}

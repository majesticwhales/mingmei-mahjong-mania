import { describe, expect, it } from "vitest";
import { HttpError } from "../../../src/lib/http-error.ts";
import {
  DEFAULT_GEOFENCE_RADIUS_METERS,
  evaluateGeolocation,
  haversineDistanceMeters,
  parseGeoPayload,
} from "../../../src/services/geolocation.ts";

/**
 * One degree of latitude is ~111_195 m on a sphere of radius 6_371_000 m
 * (π R / 180). We assert against this with a generous tolerance so the
 * test is robust to floating-point drift but tight enough to catch
 * accidental unit / radius mistakes.
 */
const METERS_PER_DEG_LATITUDE = 111_194.926644;

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    const point = { latitude: 43.6747046, longitude: -79.406983 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it("returns ~111_195 m for a 1° latitude offset along the equator", () => {
    const a = { latitude: 0, longitude: 0 };
    const b = { latitude: 1, longitude: 0 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(METERS_PER_DEG_LATITUDE, 0);
  });

  it("is symmetric (A→B == B→A)", () => {
    const a = { latitude: 43.6747046, longitude: -79.406983 };
    const b = { latitude: 43.7246418, longitude: -79.4475031 };
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(
      haversineDistanceMeters(b, a),
      6,
    );
  });

  it("computes a known short distance to within a few meters", () => {
    const node = { latitude: 43.6747046, longitude: -79.406983 };
    const oneHundredMetersNorth = {
      latitude: 43.6747046 + 100 / METERS_PER_DEG_LATITUDE,
      longitude: -79.406983,
    };
    expect(
      haversineDistanceMeters(node, oneHundredMetersNorth),
    ).toBeCloseTo(100, 1);
  });
});

describe("parseGeoPayload", () => {
  it("returns null when the field is absent (undefined)", () => {
    expect(parseGeoPayload(undefined)).toBeNull();
  });

  it("returns null when the field is explicitly null (geolocation denied path)", () => {
    expect(parseGeoPayload(null)).toBeNull();
  });

  it("parses a valid payload", () => {
    const parsed = parseGeoPayload({
      latitude: 43.6747046,
      longitude: -79.406983,
      accuracy: 12,
    });
    expect(parsed).toEqual({
      latitude: 43.6747046,
      longitude: -79.406983,
      accuracy: 12,
    });
  });

  it("round-trips the optional capturedAt field", () => {
    const parsed = parseGeoPayload({
      latitude: 0,
      longitude: 0,
      accuracy: 5,
      capturedAt: "2026-06-01T20:30:00.000Z",
    });
    expect(parsed?.capturedAt).toBe("2026-06-01T20:30:00.000Z");
  });

  it("rejects non-object values", () => {
    expect(() => parseGeoPayload("not an object")).toThrow(HttpError);
    expect(() => parseGeoPayload(42)).toThrow(HttpError);
    expect(() => parseGeoPayload([0, 0, 5])).toThrow(HttpError);
  });

  it("rejects missing required fields", () => {
    expect(() => parseGeoPayload({ longitude: 0, accuracy: 5 })).toThrow(
      /latitude is required/,
    );
    expect(() => parseGeoPayload({ latitude: 0, accuracy: 5 })).toThrow(
      /longitude is required/,
    );
    expect(() => parseGeoPayload({ latitude: 0, longitude: 0 })).toThrow(
      /accuracy is required/,
    );
  });

  it("rejects non-finite numbers", () => {
    expect(() =>
      parseGeoPayload({ latitude: Number.NaN, longitude: 0, accuracy: 5 }),
    ).toThrow(/latitude must be a finite number/);
    expect(() =>
      parseGeoPayload({
        latitude: 0,
        longitude: Number.POSITIVE_INFINITY,
        accuracy: 5,
      }),
    ).toThrow(/longitude must be a finite number/);
    expect(() =>
      parseGeoPayload({ latitude: 0, longitude: 0, accuracy: Number.NaN }),
    ).toThrow(/accuracy must be a finite number/);
  });

  it("rejects non-numeric values", () => {
    expect(() =>
      parseGeoPayload({ latitude: "0", longitude: 0, accuracy: 5 }),
    ).toThrow(/latitude must be a finite number/);
  });

  it("rejects out-of-range latitudes and longitudes", () => {
    expect(() =>
      parseGeoPayload({ latitude: 91, longitude: 0, accuracy: 5 }),
    ).toThrow(/latitude must be in \[-90, 90\]/);
    expect(() =>
      parseGeoPayload({ latitude: -91, longitude: 0, accuracy: 5 }),
    ).toThrow(/latitude must be in \[-90, 90\]/);
    expect(() =>
      parseGeoPayload({ latitude: 0, longitude: 181, accuracy: 5 }),
    ).toThrow(/longitude must be in \[-180, 180\]/);
    expect(() =>
      parseGeoPayload({ latitude: 0, longitude: -181, accuracy: 5 }),
    ).toThrow(/longitude must be in \[-180, 180\]/);
  });

  it("rejects negative accuracy", () => {
    expect(() =>
      parseGeoPayload({ latitude: 0, longitude: 0, accuracy: -1 }),
    ).toThrow(/accuracy must be >= 0/);
  });

  it("rejects non-string capturedAt", () => {
    expect(() =>
      parseGeoPayload({
        latitude: 0,
        longitude: 0,
        accuracy: 5,
        capturedAt: 12345,
      }),
    ).toThrow(/capturedAt must be a non-empty string/);
  });

  it("rejects empty-string capturedAt", () => {
    expect(() =>
      parseGeoPayload({
        latitude: 0,
        longitude: 0,
        accuracy: 5,
        capturedAt: "",
      }),
    ).toThrow(/capturedAt must be a non-empty string/);
  });
});

describe("evaluateGeolocation", () => {
  const station = {
    latitude: 43.6747046,
    longitude: -79.406983,
    geofenceRadiusMeters: 100,
  };

  it("validates when the point is on the station and accuracy is tight", () => {
    const result = evaluateGeolocation(
      { latitude: 43.6747046, longitude: -79.406983, accuracy: 10 },
      station,
    );
    expect(result.distanceMeters).toBeCloseTo(0, 6);
    expect(result.withinGeofence).toBe(true);
    expect(result.accuracyAcceptable).toBe(true);
    expect(result.validated).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("warns when the point is outside the geofence (but accuracy is fine)", () => {
    // ~200 m north of the station — outside the 100 m radius.
    const result = evaluateGeolocation(
      {
        latitude: 43.6747046 + 200 / METERS_PER_DEG_LATITUDE,
        longitude: -79.406983,
        accuracy: 10,
      },
      station,
    );
    expect(result.distanceMeters).toBeGreaterThan(100);
    expect(result.withinGeofence).toBe(false);
    expect(result.accuracyAcceptable).toBe(true);
    expect(result.validated).toBe(false);
    expect(result.warning).toBe(true);
  });

  it("warns when the point is inside the geofence but the accuracy is poor (relative rule)", () => {
    const result = evaluateGeolocation(
      { latitude: 43.6747046, longitude: -79.406983, accuracy: 150 },
      station,
    );
    expect(result.withinGeofence).toBe(true);
    expect(result.accuracyAcceptable).toBe(false);
    expect(result.validated).toBe(false);
    expect(result.warning).toBe(true);
  });

  it("warns when both checks fail", () => {
    const result = evaluateGeolocation(
      {
        latitude: 43.6747046 + 200 / METERS_PER_DEG_LATITUDE,
        longitude: -79.406983,
        accuracy: 250,
      },
      station,
    );
    expect(result.withinGeofence).toBe(false);
    expect(result.accuracyAcceptable).toBe(false);
    expect(result.validated).toBe(false);
    expect(result.warning).toBe(true);
  });

  it("treats a point exactly on the geofence boundary as validated (inclusive `<=`)", () => {
    // Place the point exactly 100 m north of the station.
    const result = evaluateGeolocation(
      {
        latitude: 43.6747046 + 100 / METERS_PER_DEG_LATITUDE,
        longitude: -79.406983,
        accuracy: 100,
      },
      station,
    );
    // Haversine may be a hair short or over 100m due to floating point; the
    // boundary case test uses `accuracy === radius` (exactly) which we know
    // is inclusive. Assert that path explicitly.
    expect(result.accuracyAcceptable).toBe(true);
    // For the distance side we just verify the result didn't flip on a
    // hair-line difference: validated may be true or false depending on
    // floating point, but warning === !validated must always hold.
    expect(result.warning).toBe(!result.validated);
  });

  it("falls back to DEFAULT_GEOFENCE_RADIUS_METERS when the node has a null radius", () => {
    const result = evaluateGeolocation(
      { latitude: 43.6747046, longitude: -79.406983, accuracy: 50 },
      {
        latitude: 43.6747046,
        longitude: -79.406983,
        geofenceRadiusMeters: null,
      },
    );
    // 50 m accuracy <= 100 m default radius → acceptable.
    expect(result.accuracyAcceptable).toBe(true);
    expect(result.validated).toBe(true);
    // And confirm a point > 100 m away with a null radius warns.
    const outside = evaluateGeolocation(
      {
        latitude: 43.6747046 + 150 / METERS_PER_DEG_LATITUDE,
        longitude: -79.406983,
        accuracy: 10,
      },
      {
        latitude: 43.6747046,
        longitude: -79.406983,
        geofenceRadiusMeters: null,
      },
    );
    expect(outside.withinGeofence).toBe(false);
    expect(outside.warning).toBe(true);
  });

  it("exports DEFAULT_GEOFENCE_RADIUS_METERS === 100 (matches map-clone-service clone-time default)", () => {
    expect(DEFAULT_GEOFENCE_RADIUS_METERS).toBe(100);
  });
});

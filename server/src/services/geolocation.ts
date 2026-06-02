/**
 * Pure geolocation helpers used by the CHECK_IN engine handler (Phase F).
 *
 * Three responsibilities, no I/O:
 *
 *   1. **Haversine distance** (`haversineDistanceMeters`) — great-circle
 *      distance between two WGS84 points using a spherical Earth model
 *      (radius 6_371_000 m). Subway-station precision (~10 m) does not
 *      need Vincenty / ellipsoidal correction; the constant-radius
 *      approximation is well under 0.5 % off across the TTC catchment.
 *
 *   2. **Payload parsing** (`parseGeoPayload`) — defensive runtime
 *      validation for the optional `geo` field on the CHECK_IN command
 *      payload. Returns `null` when the field is absent (the wire shape
 *      explicitly marks it optional). Throws `HttpError(400)` when
 *      present-but-malformed so the queue worker surfaces a clean
 *      rejection rather than a generic 500.
 *
 *   3. **Evaluation** (`evaluateGeolocation`) — combines a parsed payload
 *      with a station's lat/lng/radius and returns flat booleans the
 *      handler can drop straight into the `game_team_positions`
 *      `geofence_validated` and `geolocation_warning` columns plus the
 *      `CHECK_IN` event payload. Per TDD §3.4 the warning is advisory
 *      only — the handler never rejects on it.
 *
 * The `DEFAULT_GEOFENCE_RADIUS_METERS` constant lives here so both this
 * module and `map-clone-service` (which fills in `null` radii at clone
 * time) share a single source of truth.
 */

import { HttpError } from "../lib/http-error.ts";

/**
 * Spherical-Earth fallback radius for the geofence when a station has a
 * `NULL` `geofence_radius_meters`. Matches the radius
 * `map-clone-service` already uses to fill in nulls at clone time, so a
 * cloned game and a runtime evaluation never disagree about the
 * effective radius.
 */
export const DEFAULT_GEOFENCE_RADIUS_METERS = 100;

/** Mean Earth radius (IUGG) used by the haversine implementation. */
const EARTH_RADIUS_METERS = 6_371_000;

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Parsed shape of the optional `geo` field on a CHECK_IN command. */
export interface GeoInput {
  latitude: number;
  longitude: number;
  /** Browser-reported accuracy in meters; must be `>= 0`. */
  accuracy: number;
  /** Optional ISO timestamp from the browser clock; informational only. */
  capturedAt?: string;
}

export interface GeoEvaluation {
  /** Great-circle distance from the device's position to the station, in meters. */
  distanceMeters: number;
  /** `distanceMeters <= effectiveRadius`. */
  withinGeofence: boolean;
  /** `accuracy <= effectiveRadius` — relative threshold per Phase F decision. */
  accuracyAcceptable: boolean;
  /** Truthy when both checks pass. Persisted into `geofence_validated`. */
  validated: boolean;
  /** Truthy when **either** check fails. Persisted into `geolocation_warning`. */
  warning: boolean;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Great-circle distance between two WGS84 points using the haversine
 * formula and a spherical-Earth model. Inputs are degrees; output is
 * meters.
 */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return EARTH_RADIUS_METERS * c;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function fail(field: string, reason: string): never {
  throw new HttpError(
    400,
    "invalid_payload",
    `CHECK_IN geo.${field} ${reason}`,
  );
}

/**
 * Defensive runtime validator for the `geo` field on a CHECK_IN payload.
 *
 * - Returns `null` when the field is absent or explicitly `undefined`.
 *   The wire shape marks `geo` optional (client TDD §2 — geolocation is
 *   warn-and-allow on the client) so this is the back-compat path.
 * - Throws `HttpError(400, "invalid_payload", ...)` when present but
 *   malformed: non-object, missing required fields, non-finite numbers,
 *   out-of-range lat/lng, negative accuracy, non-string `capturedAt`.
 * - Accepts `null` as "absent" (a client that initialised the field to
 *   `null` on geolocation deny / unavailable shouldn't get a 400).
 */
export function parseGeoPayload(value: unknown): GeoInput | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(
      400,
      "invalid_payload",
      "CHECK_IN geo must be an object when present",
    );
  }
  const record = value as Record<string, unknown>;

  if (!("latitude" in record)) {
    fail("latitude", "is required");
  }
  if (!("longitude" in record)) {
    fail("longitude", "is required");
  }
  if (!("accuracy" in record)) {
    fail("accuracy", "is required");
  }

  const { latitude, longitude, accuracy, capturedAt } = record;

  if (!isFiniteNumber(latitude)) {
    fail("latitude", "must be a finite number");
  }
  if (!isFiniteNumber(longitude)) {
    fail("longitude", "must be a finite number");
  }
  if (!isFiniteNumber(accuracy)) {
    fail("accuracy", "must be a finite number");
  }
  if (latitude < -90 || latitude > 90) {
    fail("latitude", "must be in [-90, 90]");
  }
  if (longitude < -180 || longitude > 180) {
    fail("longitude", "must be in [-180, 180]");
  }
  if (accuracy < 0) {
    fail("accuracy", "must be >= 0");
  }

  const parsed: GeoInput = { latitude, longitude, accuracy };

  if (capturedAt !== undefined) {
    if (typeof capturedAt !== "string" || capturedAt.length === 0) {
      fail("capturedAt", "must be a non-empty string when present");
    }
    parsed.capturedAt = capturedAt;
  }

  return parsed;
}

/**
 * Combine a parsed geo payload with a station's coordinates and radius
 * to produce the flat booleans persisted into `game_team_positions` and
 * lifted into the `CHECK_IN` event payload.
 *
 * `effectiveRadius`:
 *   - When `node.geofenceRadiusMeters` is null, fall back to
 *     `DEFAULT_GEOFENCE_RADIUS_METERS`. The clone path already
 *     materialises 100 m at game start so this branch is belt-and-
 *     suspenders for the runtime, not the production hot path.
 *
 * Threshold semantics:
 *   - `withinGeofence = distance <= effectiveRadius` (boundary inclusive).
 *   - `accuracyAcceptable = accuracy <= effectiveRadius` (relative,
 *     per Phase F decision: warn when GPS noise exceeds the station's
 *     own radius, since that's the regime where the device cannot
 *     prove it's actually in the geofence).
 *   - `validated = withinGeofence && accuracyAcceptable`.
 *   - `warning = !validated` (warn whenever either check fails).
 */
export function evaluateGeolocation(
  input: GeoInput,
  node: {
    latitude: number;
    longitude: number;
    geofenceRadiusMeters: number | null;
  },
): GeoEvaluation {
  const effectiveRadius =
    node.geofenceRadiusMeters ?? DEFAULT_GEOFENCE_RADIUS_METERS;

  const distanceMeters = haversineDistanceMeters(
    { latitude: input.latitude, longitude: input.longitude },
    { latitude: node.latitude, longitude: node.longitude },
  );

  const withinGeofence = distanceMeters <= effectiveRadius;
  const accuracyAcceptable = input.accuracy <= effectiveRadius;
  const validated = withinGeofence && accuracyAcceptable;
  const warning = !validated;

  return {
    distanceMeters,
    withinGeofence,
    accuracyAcceptable,
    validated,
    warning,
  };
}

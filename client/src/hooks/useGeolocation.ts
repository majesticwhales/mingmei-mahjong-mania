export interface GeoResult {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export interface CaptureGeolocationOptions {
  timeoutMs?: number;
  enableHighAccuracy?: boolean;
  maximumAge?: number;
}

/**
 * Per Phase L (TDD §3.12), every user-driven command attempts a geo
 * capture before submission. The shared settings — 2-second timeout,
 * low-accuracy mode, 60-second cache — mirror the original CHECK_IN
 * fast path: prefer the OS-cached fix so the command doesn't hang waiting
 * for a full GPS warm-up, and treat permission denials / timeouts as a
 * non-fatal "no sample" (server-side `recordCommandGeolocation` accepts
 * null and silently drops malformed input, so this never blocks
 * submission).
 */
export function captureGeolocationForCommand(): Promise<GeoResult | null> {
  return captureGeolocation({
    timeoutMs: 2000,
    enableHighAccuracy: false,
    maximumAge: 60_000,
  });
}

export function captureGeolocation(
  options: CaptureGeolocationOptions = {},
): Promise<GeoResult | null> {
  const {
    timeoutMs = 5000,
    enableHighAccuracy = false,
    maximumAge = 60_000,
  } = options;

  if (!("geolocation" in navigator)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date().toISOString(),
        });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy, timeout: timeoutMs, maximumAge },
    );
  });
}

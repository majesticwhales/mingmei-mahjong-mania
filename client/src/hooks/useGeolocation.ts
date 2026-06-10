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

/** Fast path for CHECK_IN: prefer cached coords, skip high-accuracy GPS wait. */
export function captureGeolocationForCheckIn(): Promise<GeoResult | null> {
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

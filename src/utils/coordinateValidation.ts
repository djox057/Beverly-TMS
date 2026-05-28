// Shared coordinate validation used before persisting geocoded stop coordinates
// and before computing miles_away. Prevents Mapbox/OSM mis-geocodes (e.g. an
// address in Georgia resolving to Alaska) from being saved or driving 4000+
// "miles away" values.

// Continental US bounding box (loose, includes a small buffer).
export const US_LOCATION_BOUNDS = {
  minLat: 24.0,
  maxLat: 50.0,
  minLon: -125.5,
  maxLon: -65.0,
};

// Approximate per-state bounds. Used only as a sanity check; missing entries
// mean "no state-specific validation, fall back to US bounds only".
export const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }> = {
  AL: { minLat: 30.1, maxLat: 35.1, minLon: -88.6, maxLon: -84.8 },
  AR: { minLat: 33.0, maxLat: 36.6, minLon: -94.7, maxLon: -89.6 },
  AZ: { minLat: 31.3, maxLat: 37.1, minLon: -114.9, maxLon: -109.0 },
  CA: { minLat: 32.4, maxLat: 42.1, minLon: -124.6, maxLon: -114.0 },
  CO: { minLat: 36.9, maxLat: 41.1, minLon: -109.1, maxLon: -102.0 },
  CT: { minLat: 40.9, maxLat: 42.1, minLon: -73.8, maxLon: -71.7 },
  DC: { minLat: 38.7, maxLat: 39.1, minLon: -77.2, maxLon: -76.9 },
  DE: { minLat: 38.4, maxLat: 39.9, minLon: -75.8, maxLon: -74.9 },
  FL: { minLat: 24.4, maxLat: 31.1, minLon: -87.7, maxLon: -79.9 },
  GA: { minLat: 30.3, maxLat: 35.1, minLon: -85.7, maxLon: -80.7 },
  IA: { minLat: 40.3, maxLat: 43.6, minLon: -96.7, maxLon: -90.1 },
  ID: { minLat: 41.9, maxLat: 49.1, minLon: -117.3, maxLon: -110.9 },
  IL: { minLat: 36.9, maxLat: 42.6, minLon: -91.6, maxLon: -87.4 },
  IN: { minLat: 37.7, maxLat: 41.9, minLon: -88.2, maxLon: -84.7 },
  KS: { minLat: 36.9, maxLat: 40.1, minLon: -102.1, maxLon: -94.5 },
  KY: { minLat: 36.4, maxLat: 39.2, minLon: -89.7, maxLon: -81.8 },
  LA: { minLat: 28.8, maxLat: 33.1, minLon: -94.1, maxLon: -88.7 },
  MA: { minLat: 41.1, maxLat: 42.9, minLon: -73.6, maxLon: -69.8 },
  MD: { minLat: 37.8, maxLat: 39.8, minLon: -79.6, maxLon: -75.0 },
  ME: { minLat: 42.9, maxLat: 47.6, minLon: -71.1, maxLon: -66.8 },
  MI: { minLat: 41.6, maxLat: 48.4, minLon: -90.5, maxLon: -82.3 },
  MN: { minLat: 43.4, maxLat: 49.5, minLon: -97.3, maxLon: -89.4 },
  MO: { minLat: 35.9, maxLat: 40.7, minLon: -95.9, maxLon: -89.0 },
  MS: { minLat: 30.1, maxLat: 35.1, minLon: -91.7, maxLon: -88.0 },
  MT: { minLat: 44.3, maxLat: 49.1, minLon: -116.1, maxLon: -103.9 },
  NC: { minLat: 33.7, maxLat: 36.7, minLon: -84.4, maxLon: -75.3 },
  ND: { minLat: 45.8, maxLat: 49.1, minLon: -104.1, maxLon: -96.5 },
  NE: { minLat: 39.9, maxLat: 43.1, minLon: -104.1, maxLon: -95.2 },
  NH: { minLat: 42.6, maxLat: 45.4, minLon: -72.6, maxLon: -70.5 },
  NJ: { minLat: 38.8, maxLat: 41.4, minLon: -75.6, maxLon: -73.8 },
  NM: { minLat: 31.2, maxLat: 37.1, minLon: -109.1, maxLon: -103.0 },
  NV: { minLat: 34.9, maxLat: 42.1, minLon: -120.1, maxLon: -114.0 },
  NY: { minLat: 40.4, maxLat: 45.1, minLon: -79.9, maxLon: -71.8 },
  OH: { minLat: 38.3, maxLat: 42.4, minLon: -84.9, maxLon: -80.4 },
  OK: { minLat: 33.5, maxLat: 37.1, minLon: -103.1, maxLon: -94.4 },
  OR: { minLat: 41.9, maxLat: 46.4, minLon: -124.7, maxLon: -116.4 },
  PA: { minLat: 39.6, maxLat: 42.4, minLon: -80.6, maxLon: -74.6 },
  RI: { minLat: 41.1, maxLat: 42.1, minLon: -71.9, maxLon: -71.0 },
  SC: { minLat: 31.9, maxLat: 35.3, minLon: -83.5, maxLon: -78.4 },
  SD: { minLat: 42.4, maxLat: 46.0, minLon: -104.1, maxLon: -96.4 },
  TN: { minLat: 34.8, maxLat: 36.8, minLon: -90.4, maxLon: -81.5 },
  TX: { minLat: 25.7, maxLat: 36.6, minLon: -106.7, maxLon: -93.4 },
  UT: { minLat: 36.9, maxLat: 42.1, minLon: -114.1, maxLon: -108.9 },
  VA: { minLat: 36.5, maxLat: 39.6, minLon: -83.7, maxLon: -75.1 },
  VT: { minLat: 42.6, maxLat: 45.1, minLon: -73.5, maxLon: -71.4 },
  WA: { minLat: 45.4, maxLat: 49.1, minLon: -124.8, maxLon: -116.8 },
  WI: { minLat: 42.4, maxLat: 47.4, minLon: -93.0, maxLon: -86.7 },
  WV: { minLat: 37.1, maxLat: 40.7, minLon: -82.7, maxLon: -77.6 },
  WY: { minLat: 40.9, maxLat: 45.1, minLon: -111.1, maxLon: -104.0 },
};

export function isWithinUsBounds(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return (
    lat >= US_LOCATION_BOUNDS.minLat &&
    lat <= US_LOCATION_BOUNDS.maxLat &&
    lon >= US_LOCATION_BOUNDS.minLon &&
    lon <= US_LOCATION_BOUNDS.maxLon
  );
}

export function isWithinStateBounds(lat: number, lon: number, state?: string | null): boolean {
  if (!state) return true;
  const bounds = STATE_BOUNDS[state.toUpperCase()];
  if (!bounds) return true; // unknown state code → fall back to US-only check
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lon >= bounds.minLon &&
    lon <= bounds.maxLon
  );
}

/**
 * Returns true if `(lat, lon)` is a plausible geocode result for the given
 * (optional) US state. Used to reject Mapbox/OSM mis-geocodes such as
 * "a, Cartersville, GA" → Alaska.
 */
export function isValidStopCoordinate(
  lat: number | null | undefined,
  lon: number | null | undefined,
  state?: string | null,
): boolean {
  if (lat == null || lon == null) return false;
  if (!isWithinUsBounds(lat, lon)) return false;
  return isWithinStateBounds(lat, lon, state);
}
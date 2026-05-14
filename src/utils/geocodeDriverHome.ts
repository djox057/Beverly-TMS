import { geocodeAddress } from "./mapboxRouteCalculator";

export interface DriverHomeInput {
  home_address?: string | null;
  home_city?: string | null;
  home_state?: string | null;
}

/**
 * Geocode a driver's home address.
 * Requires at least home_city + home_state. Returns null otherwise or on failure.
 * Never throws — geocoding failures should not block driver save.
 */
export async function geocodeDriverHome(
  input: DriverHomeInput
): Promise<{ lat: number; lng: number } | null> {
  const city = (input.home_city ?? "").trim();
  const state = (input.home_state ?? "").trim();
  if (!city || !state) return null;

  const address = (input.home_address ?? "").trim();
  const query = address ? `${address}, ${city}, ${state}` : `${city}, ${state}`;

  try {
    const coords = await geocodeAddress(query);
    if (!coords) return null;
    return { lat: coords.lat, lng: coords.lon };
  } catch (err) {
    console.error("geocodeDriverHome failed:", err);
    return null;
  }
}
import { supabase } from "@/integrations/supabase/client";

export interface Coordinates {
  lat: number;
  lon: number;
}

/**
 * Clean address for geocoding by removing non-physical components
 * PO/PA Box numbers confuse geocoders and produce wrong coordinates
 */
function cleanAddressForGeocoding(address: string): string {
  return (
    address
      // Remove PO Box / PA Box / P.O. Box patterns
      .replace(/\b(P\.?O\.?|PA)\s*Box\s*\d+[,\s]*/gi, "")
      // Remove multiple spaces/commas left behind
      .replace(/^[\s,]+/, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/**
 * Geocode an address using the edge function with Mapbox
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim() === "") return null;

  try {
    const cleaned = cleanAddressForGeocoding(address);
    console.log("📍 Geocoding address:", address, cleaned !== address ? `(cleaned: ${cleaned})` : "");

    const { data, error } = await supabase.functions.invoke("calculate-mapbox-route", {
      body: { type: "geocode", address: cleaned },
    });

    if (error) {
      console.error("📍 Geocoding error:", error);
      return null;
    }

    if (data?.success && data?.coordinates) {
      console.log("📍 Geocoded result:", address, "→", data.coordinates);
      return data.coordinates;
    }

    console.warn("📍 No geocoding results for:", address);
    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

/**
 * Calculate driving distance between two coordinates using the edge function
 */
async function getRouteDistance(start: Coordinates, end: Coordinates): Promise<number | null> {
  try {
    const { data, error } = await supabase.functions.invoke("calculate-mapbox-route", {
      body: { type: "route", start, end },
    });

    if (error) {
      console.error("Route calculation error:", error);
      return null;
    }

    if (data?.success) {
      return data.miles;
    }

    return null;
  } catch (error) {
    console.error("Route distance error:", error);
    return null;
  }
}

/**
 * Calculate driving distance for a multi-stop route using the edge function
 */
async function getMultiStopRouteDistance(coordinates: Coordinates[]): Promise<number | null> {
  if (coordinates.length < 2) return null;

  try {
    const { data, error } = await supabase.functions.invoke("calculate-mapbox-route", {
      body: { type: "multi-stop-route", coordinates },
    });

    if (error) {
      console.error("Multi-stop route calculation error:", error);
      return null;
    }

    if (data?.success) {
      return data.miles;
    }

    return null;
  } catch (error) {
    console.error("Multi-stop route distance error:", error);
    return null;
  }
}

/**
 * Calculate loaded miles between pickup and delivery addresses
 */
export async function calculateLoadedMiles(pickupAddress: string, deliveryAddress: string): Promise<number | null> {
  console.log("🚚 Calculating loaded miles:", { pickupAddress, deliveryAddress });

  return withTimeout(
    (async () => {
      const pickupCoords = await geocodeAddress(pickupAddress);
      if (!pickupCoords) {
        console.error("Failed to geocode pickup:", pickupAddress);
        return null;
      }
      const deliveryCoords = await geocodeAddress(deliveryAddress);
      if (!deliveryCoords) {
        console.error("Failed to geocode delivery:", deliveryAddress);
        return null;
      }
      const miles = await getRouteDistance(pickupCoords, deliveryCoords);
      console.log("🚚 Loaded miles result:", miles);
      return miles;
    })(),
    15000,
    0,
  );
}

/**
 * Calculate loaded miles for a multi-stop route
 */
export async function calculateMultiStopMiles(addresses: string[]): Promise<number | null> {
  console.log("🚚 Calculating multi-stop miles:", addresses);

  return withTimeout(
    (async () => {
      const coordinates: Coordinates[] = [];
      for (const address of addresses) {
        const coords = await geocodeAddress(address);
        if (!coords) {
          console.error("Failed to geocode address:", address);
          return null;
        }
        coordinates.push(coords);
      }
      const miles = await getMultiStopRouteDistance(coordinates);
      console.log("🚚 Multi-stop miles result:", miles);
      return miles;
    })(),
    20000,
    0,
  );
}

/**
 * Calculate DH (deadhead) miles from last delivery to next pickup
 */
export async function calculateDhMiles(lastDeliveryAddress: string, nextPickupAddress: string): Promise<number | null> {
  console.log("🚚 Calculating DH miles:", { lastDeliveryAddress, nextPickupAddress });

  return withTimeout(
    (async () => {
      const lastDeliveryCoords = await geocodeAddress(lastDeliveryAddress);
      if (!lastDeliveryCoords) {
        console.error("Failed to geocode last delivery:", lastDeliveryAddress);
        return null;
      }
      const nextPickupCoords = await geocodeAddress(nextPickupAddress);
      if (!nextPickupCoords) {
        console.error("Failed to geocode next pickup:", nextPickupAddress);
        return null;
      }
      const miles = await getRouteDistance(lastDeliveryCoords, nextPickupCoords);
      console.log("🚚 DH miles result:", miles);
      return miles;
    })(),
    15000,
    0,
  );
}

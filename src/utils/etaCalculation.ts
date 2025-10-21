import { toZonedTime } from "date-fns-tz";
import { geocodeAddress, Coordinates } from "./geocoding";
import { parseSimpleDateTime } from "./dateUtils";

interface ETAResult {
  isLate: boolean;
  estimatedArrival: Date | null;
  durationMinutes: number | null;
}

/**
 * Calculate route duration using OSRM edge function
 */
async function calculateRouteDuration(
  start: Coordinates,
  end: Coordinates
): Promise<number | null> {
  try {
    const url = `https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/calculate-route`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ start, end })
    });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    
    if (data.success && data.duration !== undefined) {
      return data.duration; // Duration in seconds
    }
    
    return null;
  } catch (error) {
    console.error('Route duration calculation error:', error);
    return null;
  }
}

/**
 * Check if a truck will be late for delivery based on current location and ETA
 * @param truckLocation Current truck coordinates from Samsara
 * @param deliveryAddress Delivery address string
 * @param deliveryEndDatetime End of delivery window (e.g., "2025-10-21 15:00:00" for 3pm)
 * @returns ETAResult with late status and estimated arrival
 */
export async function checkDeliveryETA(
  truckLocation: Coordinates | null,
  deliveryAddress: string,
  deliveryEndDatetime: string | null
): Promise<ETAResult> {
  const defaultResult: ETAResult = {
    isLate: false,
    estimatedArrival: null,
    durationMinutes: null
  };

  // If no truck location or delivery end time, cannot calculate
  if (!truckLocation || !deliveryEndDatetime) {
    return defaultResult;
  }

  try {
    // Geocode delivery address
    const deliveryCoords = await geocodeAddress(deliveryAddress);
    if (!deliveryCoords) {
      return defaultResult;
    }

    // Calculate route duration
    const durationSeconds = await calculateRouteDuration(truckLocation, deliveryCoords);
    if (!durationSeconds) {
      return defaultResult;
    }

    const durationMinutes = Math.ceil(durationSeconds / 60);

    // Get current time in Chicago timezone
    const now = new Date();
    const chicagoNow = toZonedTime(now, "America/Chicago");

    // Calculate estimated arrival
    const estimatedArrival = new Date(chicagoNow.getTime() + durationSeconds * 1000);

    // Parse delivery end datetime (without timezone conversion - it's already in Chicago time)
    const parsed = parseSimpleDateTime(deliveryEndDatetime);
    const deliveryEndTime = new Date(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hours,
      parsed.minutes
    );

    // Check if ETA is after delivery end time
    const isLate = estimatedArrival > deliveryEndTime;

    return {
      isLate,
      estimatedArrival,
      durationMinutes
    };
  } catch (error) {
    console.error('ETA calculation error:', error);
    return defaultResult;
  }
}

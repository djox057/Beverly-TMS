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

  console.log('🔍 checkDeliveryETA called:', { truckLocation, deliveryAddress, deliveryEndDatetime });

  // If no truck location or delivery end time, cannot calculate
  if (!truckLocation || !deliveryEndDatetime) {
    console.log('❌ Missing truck location or delivery end time');
    return defaultResult;
  }

  try {
    // Geocode delivery address
    console.log('📍 Geocoding address:', deliveryAddress);
    const deliveryCoords = await geocodeAddress(deliveryAddress);
    if (!deliveryCoords) {
      console.log('❌ Failed to geocode delivery address');
      return defaultResult;
    }
    console.log('✅ Delivery coordinates:', deliveryCoords);

    // Calculate route duration
    console.log('🚗 Calculating route duration from', truckLocation, 'to', deliveryCoords);
    const durationSeconds = await calculateRouteDuration(truckLocation, deliveryCoords);
    if (!durationSeconds) {
      console.log('❌ Failed to calculate route duration');
      return defaultResult;
    }
    console.log('✅ Route duration (seconds):', durationSeconds);

    const durationMinutes = Math.ceil(durationSeconds / 60);

    // Get current time in Chicago timezone
    const now = new Date();
    const chicagoNow = toZonedTime(now, "America/Chicago");
    console.log('🕐 Current Chicago time:', chicagoNow);

    // Calculate estimated arrival
    const estimatedArrival = new Date(chicagoNow.getTime() + durationSeconds * 1000);
    console.log('📅 Estimated arrival:', estimatedArrival);

    // Parse delivery end datetime (without timezone conversion - it's already in Chicago time)
    const parsed = parseSimpleDateTime(deliveryEndDatetime);
    const deliveryEndTime = new Date(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hours,
      parsed.minutes
    );
    console.log('⏰ Delivery end time:', deliveryEndTime);

    // Check if ETA is after delivery end time
    const isLate = estimatedArrival > deliveryEndTime;
    console.log(`${isLate ? '🔶 LATE' : '✅ ON TIME'}:`, {
      estimatedArrival,
      deliveryEndTime,
      difference: (estimatedArrival.getTime() - deliveryEndTime.getTime()) / 1000 / 60,
      durationMinutes
    });

    return {
      isLate,
      estimatedArrival,
      durationMinutes
    };
  } catch (error) {
    console.error('❌ ETA calculation error:', error);
    return defaultResult;
  }
}

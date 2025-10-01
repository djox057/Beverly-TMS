import { calculateRouteDistance, geocodeAddress, Coordinates } from './routeCalculation';

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  speed?: number;
  ageMinutes?: number;
  isValid?: boolean;
}

// Terminal coordinates (Lynwood, IL)
const TERMINAL_COORDINATES = { 
  lat: 41.575968, 
  lon: -87.578131 
};

/**
 * Clean and extract address from notes (handles PU1/PU2 format)
 */
function cleanAddress(rawAddr: string): string {
  if (!rawAddr || String(rawAddr).trim() === "") return '';
  
  let addr = String(rawAddr).trim()
    .replace(/\s+/g, ' ')
    .replace(/[\r\n]+/g, ', ')
    .replace(/[""'']/g, '"')
    .replace(/[–—]/g, '-');
  
  // Extract PU1 address if present
  if (addr.match(/PU1:|PU2:|Appt:/i)) {
    const pu1Match = addr.match(/PU1:\s*([^P]+?)(?=\s*(?:PU2:|Appt:|$))/i);
    if (pu1Match) {
      addr = pu1Match[1].trim().replace(/,\s*$/, '');
    }
  }
  
  // Remove appointment times and extra info
  addr = addr
    .replace(/\s*Appt[^,]*$/i, '')
    .replace(/\s*@\s*\d+[ap]m.*$/i, '');
  
  return addr.trim();
}

/**
 * Calculate distance from truck's current location to a target address or terminal
 * @param truckLocation Current truck location from Samsara
 * @param targetAddress Target address (pickup or delivery), or null for terminal
 * @returns Promise<number | null> Distance in miles
 */
export const calculateDistanceFromTruck = async (
  truckLocation: TruckLocation,
  targetAddress: string | null = null
): Promise<number | null> => {
  console.log('📍 Calculating distance from truck');
  console.log('📍 Truck location:', truckLocation);
  console.log('📍 Target:', targetAddress || 'TERMINAL');

  if (!truckLocation) {
    console.log('❌ Missing truck location');
    return null;
  }

  // Check location age
  if (truckLocation.ageMinutes && truckLocation.ageMinutes > 30) {
    console.warn(`⚠️ Location data is stale (${truckLocation.ageMinutes.toFixed(1)} minutes old)`);
  }

  try {
    let targetCoords: Coordinates;
    
    if (!targetAddress) {
      // Calculate to terminal
      targetCoords = TERMINAL_COORDINATES;
      console.log('📍 Using terminal coordinates');
    } else {
      // Clean and geocode target address
      const cleanedAddress = cleanAddress(targetAddress);
      console.log('📍 Cleaned address:', cleanedAddress);
      
      targetCoords = await geocodeAddress(cleanedAddress);
      
      if (!targetCoords) {
        console.warn('❌ Could not geocode target address:', cleanedAddress);
        return null;
      }
    }

    // Create coordinates from truck location
    const truckCoords: Coordinates = {
      lat: truckLocation.latitude,
      lon: truckLocation.longitude,
    };

    // Calculate route distance
    const distance = await calculateRouteDistance(truckCoords, targetCoords);
    
    console.log('✅ Distance calculation complete:', distance);
    return distance;
  } catch (error) {
    console.error('❌ Error calculating distance from truck:', error);
    return null;
  }
};

/**
 * Calculate distance for an order based on its status
 * @param truckLocation Current truck location from Samsara
 * @param order Order with status and pickup/delivery information
 * @param truckStatus Current truck status (for terminal calculation)
 * @returns Promise<number> Distance in miles (0 if not applicable)
 */
export const calculateOrderDistance = async (
  truckLocation: TruckLocation | undefined,
  order: any,
  truckStatus?: string
): Promise<number> => {
  if (!truckLocation || !order) {
    return 0;
  }

  // Check if order files exist for status determination
  const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
  const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
  const pickupArrived = order.pickupStop?.arrived_at;

  // Red status (STOPPED) - set miles to 0
  if (truckStatus === 'Maintenance') {
    console.log('🛑 Truck in maintenance, miles = 0');
    return 0;
  }

  // Dark green (delivered with POD) - don't calculate
  if (hasPOD) {
    console.log('✅ Order delivered (has POD), miles = 0');
    return 0;
  }

  // Black status (TO_TERMINAL) - calculate to terminal
  if (truckStatus === 'Available') {
    console.log('🏭 Calculating distance to terminal');
    const distance = await calculateDistanceFromTruck(truckLocation, null);
    return distance || 0;
  }

  // Light blue (pending, not picked up yet) - calculate distance to pickup
  if (!hasBOL && !pickupArrived) {
    console.log('📦 Calculating distance to pickup');
    const pickupAddress = order.pickupStop?.address;
    if (!pickupAddress) return 0;
    
    const distance = await calculateDistanceFromTruck(truckLocation, pickupAddress);
    return distance || 0;
  }

  // Lime green (in transit with BOL, not delivered yet) - calculate distance to delivery
  if (hasBOL && !hasPOD) {
    console.log('🚛 Calculating distance to delivery');
    const deliveryAddress = order.deliveryStop?.address;
    if (!deliveryAddress) return 0;
    
    const distance = await calculateDistanceFromTruck(truckLocation, deliveryAddress);
    return distance || 0;
  }

  // Any other status - set miles to 0
  return 0;
};

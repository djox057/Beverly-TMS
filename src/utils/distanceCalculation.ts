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
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 CALCULATE DISTANCE FROM TRUCK START');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚛 Truck:', truckLocation.truck_number);
  console.log('📍 Truck Location:', {
    lat: truckLocation.latitude,
    lon: truckLocation.longitude,
    ageMinutes: truckLocation.ageMinutes
  });
  console.log('🎯 Raw Target:', targetAddress || 'TERMINAL');

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
      console.log('📍 Using terminal coordinates:', targetCoords);
    } else {
      // Clean and geocode target address
      const cleanedAddress = cleanAddress(targetAddress);
      console.log('🧹 Cleaned address:', cleanedAddress);
      
      console.log('🌐 Geocoding address...');
      targetCoords = await geocodeAddress(cleanedAddress);
      console.log('🌐 Geocode result:', targetCoords);
      
      if (!targetCoords) {
        console.error('❌ GEOCODING FAILED for:', cleanedAddress);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return null;
      }
    }

    // Create coordinates from truck location
    const truckCoords: Coordinates = {
      lat: truckLocation.latitude,
      lon: truckLocation.longitude,
    };

    console.log('🛣️ Calculating route distance via OSRM...');
    console.log('🛣️ From:', truckCoords);
    console.log('🛣️ To:', targetCoords);
    
    // Calculate route distance
    const distance = await calculateRouteDistance(truckCoords, targetCoords);
    
    console.log('🛣️ OSRM Result:', distance, 'miles');
    
    if (distance === null) {
      console.error('❌ OSRM CALCULATION FAILED');
    } else {
      console.log('✅ SUCCESS: Distance =', distance, 'miles');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return distance;
  } catch (error) {
    console.error('❌ ERROR in calculateDistanceFromTruck:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
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
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   ORDER DISTANCE CALCULATION START     ║');
  console.log('╚════════════════════════════════════════╝');
  
  if (!truckLocation || !order) {
    console.log('⚠️ Missing data:', { hasTruckLocation: !!truckLocation, hasOrder: !!order });
    return 0;
  }

  console.log('📦 Order:', order.load_number);
  console.log('📦 Status:', order.status);
  console.log('🚛 Truck Status:', truckStatus);

  // Check if order files exist for status determination
  const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
  const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
  const pickupArrived = order.pickupStop?.arrived_at;

  console.log('📄 Files:', { hasBOL, hasPOD, pickupArrived: !!pickupArrived });

  // Red status (STOPPED) - set miles to 0
  if (truckStatus === 'Maintenance') {
    console.log('🛑 Truck in maintenance, returning 0 miles');
    return 0;
  }

  // Dark green (delivered with POD) - don't calculate
  if (hasPOD) {
    console.log('✅ Order delivered (has POD), returning 0 miles');
    return 0;
  }

  // Black status (TO_TERMINAL) - calculate to terminal
  if (truckStatus === 'Available') {
    console.log('🏭 Status: Available - Calculating distance to terminal');
    const distance = await calculateDistanceFromTruck(truckLocation, null);
    console.log('🏭 Terminal distance result:', distance);
    return distance || 0;
  }

  // Light blue (pending, not picked up yet) - calculate distance to pickup
  if (!hasBOL && !pickupArrived) {
    console.log('📦 Status: Pending - Calculating distance to pickup');
    const pickupStop = order.pickupStop;
    const deliveryStop = order.deliveryStop;
    console.log('📦 VERIFICATION - Pickup stop:', pickupStop);
    console.log('📦 VERIFICATION - Delivery stop (should NOT use this):', deliveryStop);
    console.log('📦 VERIFICATION - Using address from:', pickupStop?.address, '(this should be PICKUP not DELIVERY)');
    
    if (!pickupStop?.address) {
      console.log('❌ No pickup address found');
      return 0;
    }
    
    // Combine address with city and state for better geocoding
    const fullAddress = `${pickupStop.address}, ${pickupStop.city || ''}, ${pickupStop.state || ''}`.trim().replace(/,\s*,/g, ',');
    console.log('📦 Full pickup address being geocoded:', fullAddress);
    console.log('📦 COMPARISON - Delivery address (should NOT match above):', deliveryStop?.address);
    
    const distance = await calculateDistanceFromTruck(truckLocation, fullAddress);
    console.log('📦 Pickup distance result:', distance);
    return distance || 0;
  }

  // Lime green (in transit with BOL, not delivered yet) - calculate distance to delivery
  if (hasBOL && !hasPOD) {
    console.log('🚛 Status: In Transit - Calculating distance to delivery');
    const deliveryStop = order.deliveryStop;
    console.log('🚛 Delivery stop:', deliveryStop);
    
    if (!deliveryStop?.address) {
      console.log('❌ No delivery address found');
      return 0;
    }
    
    // Combine address with city and state for better geocoding
    const fullAddress = `${deliveryStop.address}, ${deliveryStop.city || ''}, ${deliveryStop.state || ''}`.trim().replace(/,\s*,/g, ',');
    console.log('🚛 Full delivery address:', fullAddress);
    
    const distance = await calculateDistanceFromTruck(truckLocation, fullAddress);
    console.log('🚛 Delivery distance result:', distance);
    return distance || 0;
  }

  // Any other status - set miles to 0
  console.log('⚠️ No matching condition, returning 0 miles');
  return 0;
};

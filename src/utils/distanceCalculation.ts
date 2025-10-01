import { calculateRouteDistance, geocodeAddress, Coordinates } from './routeCalculation';

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

/**
 * Calculate distance from truck's current location to a target address
 * @param truckLocation Current truck location from Samsara
 * @param targetAddress Target address (pickup or delivery)
 * @returns Promise<number | null> Distance in miles
 */
export const calculateDistanceFromTruck = async (
  truckLocation: TruckLocation,
  targetAddress: string
): Promise<number | null> => {
  console.log('📍 Calculating distance from truck to target');
  console.log('📍 Truck location:', truckLocation);
  console.log('📍 Target address:', targetAddress);

  if (!targetAddress || !truckLocation) {
    console.log('❌ Missing truck location or target address');
    return null;
  }

  try {
    // Geocode target address
    const targetCoords = await geocodeAddress(targetAddress);
    
    if (!targetCoords) {
      console.warn('❌ Could not geocode target address:', targetAddress);
      return null;
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
 * @returns Promise<number> Distance in miles (0 if not applicable)
 */
export const calculateOrderDistance = async (
  truckLocation: TruckLocation | undefined,
  order: any
): Promise<number> => {
  if (!truckLocation || !order) {
    return 0;
  }

  // Check if order files exist for status determination
  const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
  const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
  const pickupArrived = order.pickupStop?.arrived_at;
  const deliveryArrived = order.deliveryStop?.arrived_at;

  // Dark green (delivered with POD) - don't calculate
  if (hasPOD) {
    return 0;
  }

  // Light blue (pending, not picked up yet) - calculate distance to pickup
  if (!hasBOL && !pickupArrived) {
    const pickupAddress = order.pickupStop?.address;
    if (!pickupAddress) return 0;
    
    const distance = await calculateDistanceFromTruck(truckLocation, pickupAddress);
    return distance || 0;
  }

  // Lime green (in transit with BOL, not delivered yet) - calculate distance to delivery
  if (hasBOL && !hasPOD) {
    const deliveryAddress = order.deliveryStop?.address;
    if (!deliveryAddress) return 0;
    
    const distance = await calculateDistanceFromTruck(truckLocation, deliveryAddress);
    return distance || 0;
  }

  // Any other status - set miles to 0
  return 0;
};

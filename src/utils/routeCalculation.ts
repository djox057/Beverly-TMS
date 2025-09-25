// Utility functions for geocoding and route calculation

interface Coordinates {
  lat: number;
  lon: number;
}

interface OSRMRoute {
  routes: {
    distance: number; // in meters
    duration: number; // in seconds
  }[];
}

/**
 * Geocode an address using Nominatim API
 * @param address The address to geocode
 * @returns Promise<Coordinates | null>
 */
export const geocodeAddress = async (address: string): Promise<Coordinates | null> => {
  if (!address || address.trim().length === 0) {
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address.trim());
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`
    );
    
    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }
    
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

/**
 * Calculate route distance using OSRM API
 * @param start Starting coordinates
 * @param end Ending coordinates
 * @returns Promise<number | null> Distance in miles
 */
export const calculateRouteDistance = async (
  start: Coordinates, 
  end: Coordinates
): Promise<number | null> => {
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false&alternatives=false&steps=false`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`OSRM API error: ${response.status}`);
    }
    
    const data: OSRMRoute = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      const distanceInMeters = data.routes[0].distance;
      const distanceInMiles = Math.round(distanceInMeters * 0.000621371); // Convert meters to miles
      return distanceInMiles;
    }
    
    return null;
  } catch (error) {
    console.error('Route calculation error:', error);
    return null;
  }
};

/**
 * Calculate loaded miles from pickup to delivery addresses
 * @param pickupAddress Pickup address string
 * @param deliveryAddress Delivery address string
 * @returns Promise<number | null> Loaded miles
 */
export const calculateLoadedMiles = async (
  pickupAddress: string,
  deliveryAddress: string
): Promise<number | null> => {
  if (!pickupAddress || !deliveryAddress) {
    return null;
  }

  try {
    // Geocode both addresses
    const [pickupCoords, deliveryCoords] = await Promise.all([
      geocodeAddress(pickupAddress),
      geocodeAddress(deliveryAddress)
    ]);

    if (!pickupCoords || !deliveryCoords) {
      console.warn('Could not geocode one or both addresses');
      return null;
    }

    // Calculate route distance
    const distance = await calculateRouteDistance(pickupCoords, deliveryCoords);
    return distance;
  } catch (error) {
    console.error('Error calculating loaded miles:', error);
    return null;
  }
};
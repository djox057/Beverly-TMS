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
    console.log('❌ Geocoding: Empty address provided');
    return null;
  }

  try {
    const encodedAddress = encodeURIComponent(address.trim());
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1&countrycodes=us`;
    
    console.log('🌍 Geocoding request:', {
      originalAddress: address,
      encodedAddress,
      url
    });
    
    const response = await fetch(url);
    
    console.log('🌍 Nominatim response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ Nominatim API error:', response.status, response.statusText);
      throw new Error(`Nominatim API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('🌍 Nominatim response data:', data);
    
    if (data && data.length > 0) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
      console.log('✅ Geocoding successful:', coords);
      return coords;
    }
    
    console.warn('⚠️ No geocoding results found for address:', address);
    return null;
  } catch (error) {
    console.error('❌ Geocoding error for address:', address, error);
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
    
    console.log('🚛 Route calculation request:', {
      startCoords: start,
      endCoords: end,
      url
    });
    
    const response = await fetch(url);
    
    console.log('🚛 OSRM response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ OSRM API error:', response.status, response.statusText);
      throw new Error(`OSRM API error: ${response.status}`);
    }
    
    const data: OSRMRoute = await response.json();
    
    console.log('🚛 OSRM response data:', data);
    
    if (data.routes && data.routes.length > 0) {
      const distanceInMeters = data.routes[0].distance;
      const distanceInMiles = Math.round(distanceInMeters * 0.000621371); // Convert meters to miles
      console.log('✅ Route calculation successful:', {
        distanceInMeters,
        distanceInMiles,
        duration: data.routes[0].duration
      });
      return distanceInMiles;
    }
    
    console.warn('⚠️ No route found between coordinates');
    return null;
  } catch (error) {
    console.error('❌ Route calculation error:', error);
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
  console.log('📍 Starting loaded miles calculation:', {
    pickupAddress,
    deliveryAddress
  });

  if (!pickupAddress || !deliveryAddress) {
    console.log('❌ Missing addresses for loaded miles calculation');
    return null;
  }

  try {
    // Geocode both addresses
    console.log('🔄 Starting parallel geocoding...');
    const [pickupCoords, deliveryCoords] = await Promise.all([
      geocodeAddress(pickupAddress),
      geocodeAddress(deliveryAddress)
    ]);

    console.log('📍 Geocoding results:', {
      pickupCoords,
      deliveryCoords
    });

    if (!pickupCoords || !deliveryCoords) {
      console.warn('❌ Could not geocode one or both addresses:', {
        pickupSuccess: !!pickupCoords,
        deliverySuccess: !!deliveryCoords,
        pickupAddress,
        deliveryAddress
      });
      return null;
    }

    // Calculate route distance
    console.log('🔄 Starting route calculation...');
    const distance = await calculateRouteDistance(pickupCoords, deliveryCoords);
    
    console.log('✅ Loaded miles calculation complete:', distance);
    return distance;
  } catch (error) {
    console.error('❌ Error calculating loaded miles:', error);
    return null;
  }
};
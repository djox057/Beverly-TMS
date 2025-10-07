// Utility functions for geocoding and route calculation

export interface Coordinates {
  lat: number;
  lon: number;
}

interface AddressComponents {
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  postalcode?: string;
}

interface GeocodingReport {
  strategyStats: {
    [key: string]: {
      attempts: number;
      successes: number;
    };
  };
}

interface OSRMRoute {
  routes: {
    distance: number; // in meters
    duration: number; // in seconds
  }[];
}

// Global report for tracking geocoding strategy statistics
const report: GeocodingReport = {
  strategyStats: {}
};

/**
 * Parse address components from a full address string
 */
const parseAddressComponents = (address: string): AddressComponents => {
  const components: AddressComponents = {};
  
  // Parse state first (any 2 uppercase letters)
  const stateMatch = address.match(/\b([A-Z]{2})\b/);
  if (stateMatch) {
    components.state = stateMatch[1];
  }
  
  // Parse ZIP code - must come after state or at end of address to avoid matching street numbers
  // Match pattern: STATE ZIP or just ZIP at the end
  const zipMatch = address.match(/[A-Z]{2}\s+(\d{5}(?:-\d{4})?)\b|,\s*(\d{5}(?:-\d{4})?)\s*$/);
  if (zipMatch) {
    components.postalcode = zipMatch[1] || zipMatch[2];
  }
  
  // Extract street (everything before first comma or before city/state/zip)
  const streetMatch = address.match(/^([^,]+)/);
  if (streetMatch) {
    let street = streetMatch[1].trim();
    // Remove suite/unit info for cleaner geocoding
    street = street.replace(/\b(suite|ste|unit|apt|apartment|#)\s*\w+/gi, '').trim();
    components.street = street;
  }
  
  // Try to extract city - look for pattern: street, city, state zip
  const cityStateMatch = address.match(/,\s*([^,]+?),?\s+([A-Z]{2})\s*\d{5}/);
  if (cityStateMatch) {
    components.city = cityStateMatch[1].trim();
  }
  
  // Try to extract county from patterns like "Williams County"
  const countyMatch = address.match(/\b(\w+\s+County)\b/i);
  if (countyMatch) {
    components.county = countyMatch[1];
  }
  
  return components;
};

/**
 * Build Nominatim URL from address components
 */
const buildNominatimUrl = (components: AddressComponents, useCounty = false): string => {
  const baseUrl = 'https://nominatim.server4beverly.us/search';
  const params = new URLSearchParams({
    format: 'json',
    limit: '5',
    countrycodes: 'us'
  });
  
  if (components.street) params.append('street', components.street);
  if (useCounty && components.county) {
    params.append('county', components.county);
  } else if (components.city) {
    params.append('city', components.city);
  }
  if (components.state) params.append('state', components.state);
  if (components.postalcode) params.append('postalcode', components.postalcode);
  
  return `${baseUrl}?${params.toString()}`;
};

/**
 * Try a single geocoding strategy
 */
const tryGeocodingStrategy = async (
  url: string, 
  strategyName: string, 
  originalAddress: string
): Promise<Coordinates | null> => {
  // Initialize strategy stats if not exists
  if (!report.strategyStats[strategyName]) {
    report.strategyStats[strategyName] = { attempts: 0, successes: 0 };
  }
  
  report.strategyStats[strategyName].attempts++;
  
  console.log(`🌍 Trying strategy "${strategyName}":`, {
    originalAddress,
    url
  });
  
  try {
    // Add User-Agent for public OpenStreetMap Nominatim (required by their usage policy)
    const headers: HeadersInit = {};
    if (url.includes('openstreetmap.org')) {
      headers['User-Agent'] = 'TruckingApp/1.0';
    }
    
    const response = await fetch(url, { headers });
    console.log(`🌍 ${strategyName} response status:`, response.status);
    
    if (!response.ok) {
      console.error(`❌ ${strategyName} API error:`, response.status, response.statusText);
      return null;
    }
    
    const data = await response.json();
    console.log(`🌍 ${strategyName} response data:`, data);
    
    if (data && data.length > 0) {
      const coords = {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
      
      report.strategyStats[strategyName].successes++;
      console.log(`✅ ${strategyName} successful:`, coords);
      return coords;
    }
    
    console.warn(`⚠️ ${strategyName} returned no results`);
    return null;
  } catch (error) {
    console.error(`❌ ${strategyName} error:`, error);
    return null;
  }
};

/**
 * Geocode an address using Nominatim API with multiple strategies including county fallback
 * @param address The address to geocode
 * @returns Promise<Coordinates | null>
 */
export const geocodeAddress = async (address: string): Promise<Coordinates | null> => {
  if (!address || address.trim().length === 0) {
    console.log('❌ Geocoding: Empty address provided');
    return null;
  }

  const components = parseAddressComponents(address);
  console.log('📍 Parsed address components:', components);

  // Strategy 1: Full cleaned address
  try {
    const cleanedAddress = address.trim().replace(/\b(suite|ste|unit|apt|apartment|#)\s*\w+/gi, '').trim();
    const encodedAddress = encodeURIComponent(cleanedAddress);
    const fullUrl = `https://nominatim.server4beverly.us/search?format=json&q=${encodedAddress}&limit=5&countrycodes=us`;
    
    console.log('🎯 GEOCODING ATTEMPT:', {
      strategy: 'Full Cleaned Address',
      originalAddress: address,
      cleanedAddress: cleanedAddress,
      url: fullUrl
    });
    
    const result = await tryGeocodingStrategy(fullUrl, "Full Cleaned Address", address);
    if (result) {
      console.log('✅ GEOCODING SUCCESS - Using coordinates:', result);
      return result;
    }
  } catch (error) {
    console.error('❌ Strategy 1 failed:', error);
  }

  // Strategy 2: Full address + USA
  try {
    const addressWithUSA = `${address.trim()}, USA`;
    const encodedAddress = encodeURIComponent(addressWithUSA);
    const usaUrl = `https://nominatim.server4beverly.us/search?format=json&q=${encodedAddress}&limit=5&countrycodes=us`;
    
    const result = await tryGeocodingStrategy(usaUrl, "Full Address + USA", address);
    if (result) return result;
  } catch (error) {
    console.error('❌ Strategy 2 failed:', error);
  }

  // Strategy 3: Structured query with city
  if (components.street && components.city && components.state) {
    try {
      const structuredUrl = buildNominatimUrl(components, false);
      const result = await tryGeocodingStrategy(structuredUrl, "Street + City + State + ZIP", address);
      if (result) return result;
    } catch (error) {
      console.error('❌ Strategy 3 failed:', error);
    }
  }

  // Strategy 4: NEW - Structured query with county (if county and state available)
  if (components.street && components.county && components.state) {
    try {
      const countyUrl = buildNominatimUrl(components, true);
      const result = await tryGeocodingStrategy(countyUrl, "Street + County + State + ZIP", address);
      if (result) return result;
    } catch (error) {
      console.error('❌ Strategy 4 (County) failed:', error);
    }
  }

  // Strategy 5: ZIP code only (final fallback for server4beverly)
  if (components.postalcode) {
    try {
      const zipUrl = `https://nominatim.server4beverly.us/search?format=json&postalcode=${components.postalcode}&countrycodes=us&limit=5`;
      const result = await tryGeocodingStrategy(zipUrl, "ZIP Code Only (server4beverly)", address);
      if (result) return result;
    } catch (error) {
      console.error('❌ Strategy 5 failed:', error);
    }
  }

  // ===== PUBLIC OSM NOMINATIM FALLBACK STRATEGIES =====
  console.log('⚠️ All server4beverly strategies failed, trying public OpenStreetMap Nominatim...');

  // Strategy 6: Full cleaned address on public OSM
  try {
    const cleanedAddress = address.trim().replace(/\b(suite|ste|unit|apt|apartment|#)\s*\w+/gi, '').trim();
    const encodedAddress = encodeURIComponent(cleanedAddress);
    const osmUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=5&countrycodes=us`;
    
    const result = await tryGeocodingStrategy(osmUrl, "Full Cleaned Address (OSM Public)", address);
    if (result) {
      console.log('✅ GEOCODING SUCCESS with OSM Public - Using coordinates:', result);
      return result;
    }
  } catch (error) {
    console.error('❌ Strategy 6 (OSM) failed:', error);
  }

  // Strategy 7: Full address + USA on public OSM
  try {
    const addressWithUSA = `${address.trim()}, USA`;
    const encodedAddress = encodeURIComponent(addressWithUSA);
    const osmUsaUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=5&countrycodes=us`;
    
    const result = await tryGeocodingStrategy(osmUsaUrl, "Full Address + USA (OSM Public)", address);
    if (result) return result;
  } catch (error) {
    console.error('❌ Strategy 7 (OSM) failed:', error);
  }

  // Strategy 8: Structured query on public OSM (city)
  if (components.street && components.city && components.state) {
    try {
      const osmStructuredUrl = `https://nominatim.openstreetmap.org/search?format=json&street=${encodeURIComponent(components.street)}&city=${encodeURIComponent(components.city)}&state=${encodeURIComponent(components.state)}&countrycodes=us&limit=5`;
      const result = await tryGeocodingStrategy(osmStructuredUrl, "Street + City + State (OSM Public)", address);
      if (result) return result;
    } catch (error) {
      console.error('❌ Strategy 8 (OSM) failed:', error);
    }
  }

  // Log final strategy stats
  console.log('📊 Final geocoding strategy stats:', report.strategyStats);
  console.warn('❌ All geocoding strategies failed for address:', address);
  return null;
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
    const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false&alternatives=false&steps=false`;
    
    console.log('🚗 =================================');
    console.log('🚗 OSRM ROUTE CALCULATION');
    console.log('🚗 =================================');
    console.log('🚗 Start Coordinates:', start);
    console.log('🚗 End Coordinates:', end);
    console.log('🚗 OSRM URL:', url);
    
    const response = await fetch(url);
    
    console.log('🚗 OSRM response status:', response.status);
    
    if (!response.ok) {
      console.error('❌ OSRM API error:', response.status, response.statusText);
      throw new Error(`OSRM API error: ${response.status}`);
    }
    
    const data: OSRMRoute = await response.json();
    
    console.log('🚗 OSRM response data:', data);
    
    if (data.routes && data.routes.length > 0) {
      const distanceInMeters = data.routes[0].distance;
      const distanceInMiles = Math.round(distanceInMeters * 0.000621371); // Convert meters to miles
      console.log('✅ =================================');
      console.log('✅ OSRM CALCULATION COMPLETE');
      console.log('✅ =================================');
      console.log('✅ Distance in meters:', distanceInMeters);
      console.log('✅ Distance in miles:', distanceInMiles);
      console.log('✅ Duration in seconds:', data.routes[0].duration);
      console.log('✅ =================================');
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
  console.log('📍 =================================');
  console.log('📍 LOADED MILES CALCULATION START');
  console.log('📍 =================================');
  console.log('📍 Pickup Address:', JSON.stringify(pickupAddress));
  console.log('📍 Delivery Address:', JSON.stringify(deliveryAddress));
  console.log('📍 Pickup Address Length:', pickupAddress?.length || 0);
  console.log('📍 Delivery Address Length:', deliveryAddress?.length || 0);

  if (!pickupAddress || !deliveryAddress) {
    console.log('❌ Missing addresses for loaded miles calculation');
    return null;
  }

  try {
    // Geocode addresses sequentially for better debugging
    console.log('🔄 =================================');
    console.log('🔄 STARTING PICKUP GEOCODING');
    console.log('🔄 =================================');
    const pickupCoords = await geocodeAddress(pickupAddress);
    
    console.log('🔄 =================================');
    console.log('🔄 PICKUP GEOCODING COMPLETE');
    console.log('🔄 Result:', JSON.stringify(pickupCoords));
    console.log('🔄 =================================');
    
    console.log('🔄 =================================');
    console.log('🔄 STARTING DELIVERY GEOCODING');
    console.log('🔄 =================================');
    const deliveryCoords = await geocodeAddress(deliveryAddress);
    
    console.log('🔄 =================================');
    console.log('🔄 DELIVERY GEOCODING COMPLETE');
    console.log('🔄 Result:', JSON.stringify(deliveryCoords));
    console.log('🔄 =================================');

    console.log('📍 FINAL GEOCODING RESULTS:', {
      pickup: {
        address: pickupAddress,
        coords: pickupCoords,
        success: !!pickupCoords
      },
      delivery: {
        address: deliveryAddress, 
        coords: deliveryCoords,
        success: !!deliveryCoords
      }
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

/**
 * Calculate loaded miles through multiple stops (multi-drop)
 * @param addresses Array of addresses in sequence
 * @returns Promise<number | null> Total loaded miles
 */
export const calculateMultiStopMiles = async (
  addresses: string[]
): Promise<number | null> => {
  console.log('📍 =================================');
  console.log('📍 MULTI-STOP MILES CALCULATION START');
  console.log('📍 =================================');
  console.log('📍 Number of stops:', addresses.length);
  console.log('📍 Addresses:', addresses);

  if (!addresses || addresses.length < 2) {
    console.log('❌ Need at least 2 addresses for multi-stop calculation');
    return null;
  }

  try {
    // Geocode all addresses
    console.log('🔄 Geocoding all addresses...');
    const coordsPromises = addresses.map(async (address, index) => {
      console.log(`🔄 Geocoding stop ${index + 1}:`, address);
      const coords = await geocodeAddress(address);
      console.log(`✅ Stop ${index + 1} coords:`, coords);
      return coords;
    });

    const allCoords = await Promise.all(coordsPromises);

    // Check if any geocoding failed
    const failedIndex = allCoords.findIndex(coords => !coords);
    if (failedIndex !== -1) {
      console.warn(`❌ Failed to geocode address at index ${failedIndex}:`, addresses[failedIndex]);
      return null;
    }

    // Calculate route distance through all stops in sequence
    console.log('🔄 Calculating route through all stops...');
    let totalDistance = 0;

    for (let i = 0; i < allCoords.length - 1; i++) {
      const start = allCoords[i]!;
      const end = allCoords[i + 1]!;
      
      console.log(`🔄 Calculating segment ${i + 1} → ${i + 2}`);
      const segmentDistance = await calculateRouteDistance(start, end);
      
      if (segmentDistance === null) {
        console.warn(`❌ Failed to calculate distance for segment ${i + 1} → ${i + 2}`);
        return null;
      }
      
      console.log(`✅ Segment ${i + 1} → ${i + 2}: ${segmentDistance} miles`);
      totalDistance += segmentDistance;
    }

    console.log('✅ Multi-stop miles calculation complete:', totalDistance);
    return totalDistance;
  } catch (error) {
    console.error('❌ Error calculating multi-stop miles:', error);
    return null;
  }
};

/**
 * Calculate DH (Deadhead) miles from last delivery to current pickup
 * @param lastDeliveryAddress Last delivery address string
 * @param currentPickupAddress Current pickup address string
 * @returns Promise<number | null> DH miles
 */
export const calculateDhMiles = async (
  lastDeliveryAddress: string,
  currentPickupAddress: string
): Promise<number | null> => {
  console.log('🚚 =================================');
  console.log('🚚 DH MILES CALCULATION START');
  console.log('🚚 =================================');
  console.log('🚚 Last Delivery Address:', lastDeliveryAddress);
  console.log('🚚 Current Pickup Address:', currentPickupAddress);

  if (!lastDeliveryAddress || !currentPickupAddress) {
    console.log('❌ Missing addresses for DH miles calculation');
    return null;
  }

  try {
    // Geocode both addresses
    const lastDeliveryCoords = await geocodeAddress(lastDeliveryAddress);
    const currentPickupCoords = await geocodeAddress(currentPickupAddress);

    if (!lastDeliveryCoords || !currentPickupCoords) {
      console.warn('❌ Could not geocode one or both addresses for DH calculation');
      return null;
    }

    // Calculate route distance
    const distance = await calculateRouteDistance(lastDeliveryCoords, currentPickupCoords);
    
    console.log('✅ DH miles calculation complete:', distance);
    return distance;
  } catch (error) {
    console.error('❌ Error calculating DH miles:', error);
    return null;
  }
};
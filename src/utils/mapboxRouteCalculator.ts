const MAPBOX_TOKEN = 'pk.eyJ1Ijoiam9udzEyMyIsImEiOiJjbWdmOHE2dnAwNWI0MmpzY3NlOXY5NHBxIn0.sb-KPJmlqi33w5aDMMRPzA';

interface Coordinates {
  lat: number;
  lon: number;
}

/**
 * Geocode an address using Mapbox Geocoding API
 */
async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim() === '') return null;
  
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=US`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const [lon, lat] = data.features[0].center;
      return { lat, lon };
    }
    
    return null;
  } catch (error) {
    console.error('Mapbox geocoding error:', error);
    return null;
  }
}

/**
 * Calculate driving distance between two coordinates using Mapbox Directions API
 */
async function getRouteDistance(start: Coordinates, end: Coordinates): Promise<number | null> {
  try {
    const coordinates = `${start.lon},${start.lat};${end.lon},${end.lat}`;
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?access_token=${MAPBOX_TOKEN}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      // Distance is in meters, convert to miles
      const distanceInMeters = data.routes[0].distance;
      const distanceInMiles = Math.round(distanceInMeters / 1609.344);
      return distanceInMiles;
    }
    
    return null;
  } catch (error) {
    console.error('Mapbox directions error:', error);
    return null;
  }
}

/**
 * Calculate driving distance for a multi-stop route using Mapbox Directions API
 */
async function getMultiStopRouteDistance(coordinates: Coordinates[]): Promise<number | null> {
  if (coordinates.length < 2) return null;
  
  try {
    const coordString = coordinates.map(c => `${c.lon},${c.lat}`).join(';');
    const response = await fetch(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?access_token=${MAPBOX_TOKEN}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      // Distance is in meters, convert to miles
      const distanceInMeters = data.routes[0].distance;
      const distanceInMiles = Math.round(distanceInMeters / 1609.344);
      return distanceInMiles;
    }
    
    return null;
  } catch (error) {
    console.error('Mapbox multi-stop directions error:', error);
    return null;
  }
}

/**
 * Calculate loaded miles between pickup and delivery addresses
 */
export async function calculateLoadedMiles(pickupAddress: string, deliveryAddress: string): Promise<number | null> {
  console.log('🚚 Calculating loaded miles:', { pickupAddress, deliveryAddress });
  
  const pickupCoords = await geocodeAddress(pickupAddress);
  if (!pickupCoords) {
    console.error('Failed to geocode pickup address:', pickupAddress);
    return null;
  }
  
  const deliveryCoords = await geocodeAddress(deliveryAddress);
  if (!deliveryCoords) {
    console.error('Failed to geocode delivery address:', deliveryAddress);
    return null;
  }
  
  const miles = await getRouteDistance(pickupCoords, deliveryCoords);
  console.log('🚚 Loaded miles result:', miles);
  return miles;
}

/**
 * Calculate loaded miles for a multi-stop route
 */
export async function calculateMultiStopMiles(addresses: string[]): Promise<number | null> {
  console.log('🚚 Calculating multi-stop miles:', addresses);
  
  const coordinates: Coordinates[] = [];
  
  for (const address of addresses) {
    const coords = await geocodeAddress(address);
    if (!coords) {
      console.error('Failed to geocode address:', address);
      return null;
    }
    coordinates.push(coords);
  }
  
  const miles = await getMultiStopRouteDistance(coordinates);
  console.log('🚚 Multi-stop miles result:', miles);
  return miles;
}

/**
 * Calculate DH (deadhead) miles from last delivery to next pickup
 */
export async function calculateDhMiles(lastDeliveryAddress: string, nextPickupAddress: string): Promise<number | null> {
  console.log('🚚 Calculating DH miles:', { lastDeliveryAddress, nextPickupAddress });
  
  const lastDeliveryCoords = await geocodeAddress(lastDeliveryAddress);
  if (!lastDeliveryCoords) {
    console.error('Failed to geocode last delivery address:', lastDeliveryAddress);
    return null;
  }
  
  const nextPickupCoords = await geocodeAddress(nextPickupAddress);
  if (!nextPickupCoords) {
    console.error('Failed to geocode next pickup address:', nextPickupAddress);
    return null;
  }
  
  const miles = await getRouteDistance(lastDeliveryCoords, nextPickupCoords);
  console.log('🚚 DH miles result:', miles);
  return miles;
}

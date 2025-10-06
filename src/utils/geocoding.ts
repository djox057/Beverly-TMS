export interface Coordinates {
  latitude: number;
  longitude: number;
}

export async function geocodeAddress(address: string): Promise<Coordinates | null> {
  if (!address || address.trim() === '') {
    return null;
  }

  try {
    // Using Nominatim (OpenStreetMap) for geocoding - free and no API key required
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
      {
        headers: {
          'User-Agent': 'TruckingApp/1.0'
        }
      }
    );

    if (!response.ok) {
      console.error('Geocoding failed:', response.statusText);
      return null;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      return {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon)
      };
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

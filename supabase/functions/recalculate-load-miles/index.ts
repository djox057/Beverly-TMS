import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AddressComponents {
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// Parse address into components
function parseAddress(address: string, city?: string, state?: string, zip?: string): AddressComponents {
  return {
    street: address || undefined,
    city: city || undefined,
    state: state || undefined,
    zip: zip || undefined,
    country: 'United States'
  };
}

// Build Nominatim geocoding URL
function buildGeocodingUrl(components: AddressComponents): string {
  const parts: string[] = [];
  
  if (components.street) parts.push(components.street);
  if (components.city) parts.push(components.city);
  if (components.state) parts.push(components.state);
  if (components.zip) parts.push(components.zip);
  if (components.country) parts.push(components.country);
  
  const query = parts.join(', ');
  return `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
}

// Geocode an address
async function geocodeAddress(address: string, city?: string, state?: string, zip?: string) {
  const components = parseAddress(address, city, state, zip);
  const url = buildGeocodingUrl(components);
  
  console.log('🔍 Geocoding:', { address, city, state, zip });
  console.log('🔍 URL:', url);
  
  const response = await fetch(url, {
    headers: { 'User-Agent': 'TruckingApp/1.0' }
  });
  
  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data && data.length > 0) {
    const result = {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name
    };
    console.log('✅ Geocoded to:', result);
    return result;
  }
  
  throw new Error('No geocoding results found');
}

// Calculate route distance using OSRM
async function calculateRoute(start: { lat: number; lon: number }, end: { lat: number; lon: number }) {
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false&alternatives=false&steps=false`;
  
  console.log('🚗 OSRM URL:', osrmUrl);
  
  const response = await fetch(osrmUrl);
  
  if (!response.ok) {
    throw new Error(`OSRM failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (data.routes && data.routes.length > 0) {
    const distanceInMeters = data.routes[0].distance;
    const distanceInMiles = Math.round(distanceInMeters * 0.000621371);
    
    console.log('✅ Route calculated:', {
      distanceMeters: distanceInMeters,
      distanceMiles: distanceInMiles,
      duration: data.routes[0].duration
    });
    
    return {
      distanceMiles: distanceInMiles,
      distanceMeters: distanceInMeters,
      duration: data.routes[0].duration
    };
  }
  
  throw new Error('No route found');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { internalLoadNumber } = await req.json();
    
    console.log('📦 Recalculating miles for internal load:', internalLoadNumber);
    
    // Get load data from database
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const loadResponse = await fetch(
      `${supabaseUrl}/rest/v1/orders?internal_load_number=eq.${internalLoadNumber}&select=*,pickup_drops(*)`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!loadResponse.ok) {
      throw new Error('Failed to fetch load data');
    }
    
    const loads = await loadResponse.json();
    
    if (!loads || loads.length === 0) {
      throw new Error('Load not found');
    }
    
    const load = loads[0];
    const pickups = load.pickup_drops.filter((pd: any) => pd.type === 'pickup').sort((a: any, b: any) => a.sequence_number - b.sequence_number);
    const deliveries = load.pickup_drops.filter((pd: any) => pd.type === 'delivery').sort((a: any, b: any) => a.sequence_number - b.sequence_number);
    
    console.log('📍 Pickup addresses:', pickups);
    console.log('📍 Delivery addresses:', deliveries);
    
    // Geocode all addresses
    const pickupCoords = await geocodeAddress(
      pickups[0].address,
      pickups[0].city,
      pickups[0].state,
      pickups[0].zip_code
    );
    
    const deliveryCoords = await geocodeAddress(
      deliveries[deliveries.length - 1].address,
      deliveries[deliveries.length - 1].city,
      deliveries[deliveries.length - 1].state,
      deliveries[deliveries.length - 1].zip_code
    );
    
    // Calculate route
    const route = await calculateRoute(
      { lat: pickupCoords.lat, lon: pickupCoords.lon },
      { lat: deliveryCoords.lat, lon: deliveryCoords.lon }
    );
    
    return new Response(
      JSON.stringify({
        success: true,
        internalLoadNumber,
        currentMiles: load.loaded_miles,
        calculatedMiles: route.distanceMiles,
        difference: route.distanceMiles - load.loaded_miles,
        pickup: {
          address: `${pickups[0].address}, ${pickups[0].city}, ${pickups[0].state} ${pickups[0].zip_code}`,
          coords: pickupCoords
        },
        delivery: {
          address: `${deliveries[deliveries.length - 1].address}, ${deliveries[deliveries.length - 1].city}, ${deliveries[deliveries.length - 1].state} ${deliveries[deliveries.length - 1].zip_code}`,
          coords: deliveryCoords
        },
        route
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('❌ Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

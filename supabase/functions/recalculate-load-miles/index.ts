import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// State boundary validation (approximate)
const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }> = {
  'MI': { minLat: 41.7, maxLat: 48.3, minLon: -90.5, maxLon: -82.4 },
  'IN': { minLat: 37.8, maxLat: 41.8, minLon: -88.1, maxLon: -84.8 },
  'IL': { minLat: 36.9, maxLat: 42.5, minLon: -91.5, maxLon: -87.5 },
  'OH': { minLat: 38.4, maxLat: 42.3, minLon: -84.8, maxLon: -80.5 },
  'WI': { minLat: 42.5, maxLat: 47.3, minLon: -92.9, maxLon: -86.8 },
  'KY': { minLat: 36.5, maxLat: 39.1, minLon: -89.6, maxLon: -81.9 },
  'TN': { minLat: 34.9, maxLat: 36.7, minLon: -90.3, maxLon: -81.6 },
  'GA': { minLat: 30.4, maxLat: 35.0, minLon: -85.6, maxLon: -80.8 },
  'FL': { minLat: 24.5, maxLat: 31.0, minLon: -87.6, maxLon: -80.0 },
  'NC': { minLat: 33.8, maxLat: 36.6, minLon: -84.3, maxLon: -75.4 },
  'SC': { minLat: 32.0, maxLat: 35.2, minLon: -83.4, maxLon: -78.5 },
  'TX': { minLat: 25.8, maxLat: 36.5, minLon: -106.6, maxLon: -93.5 },
  'CA': { minLat: 32.5, maxLat: 42.0, minLon: -124.5, maxLon: -114.1 },
};

function isValidStateCoordinate(lat: number, lon: number, state?: string): boolean {
  if (!state || !STATE_BOUNDS[state]) return true;
  const bounds = STATE_BOUNDS[state];
  const isValid = lat >= bounds.minLat && lat <= bounds.maxLat && 
                  lon >= bounds.minLon && lon <= bounds.maxLon;
  if (!isValid) {
    console.log(`⚠️ Coordinate validation failed: ${lat}, ${lon} not in ${state} bounds`);
  }
  return isValid;
}

// Geocode an address with multiple fallback strategies
async function geocodeAddress(address: string, city?: string, state?: string, zip?: string) {
  console.log('🔍 Geocoding:', { address, city, state, zip });
  
  // Strategy 1: Try OpenStreetMap public Nominatim FIRST (more reliable)
  try {
    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
    const url1 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=5&countrycodes=us`;
    console.log('🔍 Strategy 1 (OSM) URL:', url1);
    
    const response1 = await fetch(url1, {
      headers: { 'User-Agent': 'TruckingApp/1.0' }
    });
    
    if (response1.ok) {
      const data1 = await response1.json();
      if (data1 && data1.length > 0) {
        // Try to find a result that matches the state bounds
        for (const result of data1) {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          if (isValidStateCoordinate(lat, lon, state)) {
            console.log('✅ Strategy 1 (OSM) success:', { lat, lon, display_name: result.display_name });
            return { lat, lon, display_name: result.display_name };
          }
        }
        // If no valid result, log and continue
        console.log('⚠️ Strategy 1 (OSM) returned results but none match state bounds');
      }
    }
  } catch (error) {
    console.log('⚠️ Strategy 1 (OSM) failed:', error);
  }
  
  // Strategy 2: Try structured query with state validation
  if (address && city && state && zip) {
    try {
      const url2 = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&street=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&postalcode=${encodeURIComponent(zip)}`;
      console.log('🔍 Strategy 2 (Structured) URL:', url2);
      
      const response2 = await fetch(url2, {
        headers: { 'User-Agent': 'TruckingApp/1.0' }
      });
      
      if (response2.ok) {
        const data2 = await response2.json();
        if (data2 && data2.length > 0) {
          for (const result of data2) {
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            if (isValidStateCoordinate(lat, lon, state)) {
              console.log('✅ Strategy 2 (Structured) success:', { lat, lon, display_name: result.display_name });
              return { lat, lon, display_name: result.display_name };
            }
          }
          console.log('⚠️ Strategy 2 returned results but none match state bounds');
        }
      }
    } catch (error) {
      console.log('⚠️ Strategy 2 failed:', error);
    }
  }
  
  // Strategy 3: Try city + state + ZIP (without street address) with validation
  if (city && state && zip) {
    try {
      const locationQuery = `${city}, ${state} ${zip}`;
      const url3 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationQuery)}&limit=5&countrycodes=us`;
      console.log('🔍 Strategy 3 (City/State/ZIP) URL:', url3);
      
      const response3 = await fetch(url3, {
        headers: { 'User-Agent': 'TruckingApp/1.0' }
      });
      
      if (response3.ok) {
        const data3 = await response3.json();
        if (data3 && data3.length > 0) {
          for (const result of data3) {
            const lat = parseFloat(result.lat);
            const lon = parseFloat(result.lon);
            if (isValidStateCoordinate(lat, lon, state)) {
              console.log('✅ Strategy 3 (City/State/ZIP) success:', { lat, lon, display_name: result.display_name });
              return { lat, lon, display_name: result.display_name };
            }
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Strategy 3 failed:', error);
    }
  }
  
  throw new Error(`All geocoding strategies failed for: ${address}, ${city}, ${state} ${zip}`);
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
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

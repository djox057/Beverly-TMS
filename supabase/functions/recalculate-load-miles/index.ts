import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Geocode an address with multiple fallback strategies
async function geocodeAddress(address: string, city?: string, state?: string, zip?: string) {
  console.log('🔍 Geocoding:', { address, city, state, zip });
  
  // Strategy 1: Try full address with primary Nominatim server
  try {
    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
    const url1 = `https://nominatim.server4beverly.us/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=5&countrycodes=us`;
    console.log('🔍 Strategy 1 URL:', url1);
    
    const response1 = await fetch(url1);
    if (response1.ok) {
      const data1 = await response1.json();
      if (data1 && data1.length > 0) {
        const result = {
          lat: parseFloat(data1[0].lat),
          lon: parseFloat(data1[0].lon),
          display_name: data1[0].display_name
        };
        console.log('✅ Strategy 1 success:', result);
        return result;
      }
    }
  } catch (error) {
    console.log('⚠️ Strategy 1 failed:', error);
  }
  
  // Strategy 2: Try structured query
  if (address && city && state && zip) {
    try {
      const url2 = `https://nominatim.server4beverly.us/search?format=json&limit=5&countrycodes=us&street=${encodeURIComponent(address)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}&postalcode=${encodeURIComponent(zip)}`;
      console.log('🔍 Strategy 2 URL:', url2);
      
      const response2 = await fetch(url2);
      if (response2.ok) {
        const data2 = await response2.json();
        if (data2 && data2.length > 0) {
          const result = {
            lat: parseFloat(data2[0].lat),
            lon: parseFloat(data2[0].lon),
            display_name: data2[0].display_name
          };
          console.log('✅ Strategy 2 success:', result);
          return result;
        }
      }
    } catch (error) {
      console.log('⚠️ Strategy 2 failed:', error);
    }
  }
  
  // Strategy 3: Try ZIP code only
  if (zip) {
    try {
      const url3 = `https://nominatim.server4beverly.us/search?format=json&postalcode=${encodeURIComponent(zip)}&countrycodes=us&limit=5`;
      console.log('🔍 Strategy 3 (ZIP only) URL:', url3);
      
      const response3 = await fetch(url3);
      if (response3.ok) {
        const data3 = await response3.json();
        if (data3 && data3.length > 0) {
          const result = {
            lat: parseFloat(data3[0].lat),
            lon: parseFloat(data3[0].lon),
            display_name: data3[0].display_name
          };
          console.log('✅ Strategy 3 (ZIP only) success:', result);
          return result;
        }
      }
    } catch (error) {
      console.log('⚠️ Strategy 3 failed:', error);
    }
  }
  
  // Strategy 4: Fallback to OpenStreetMap public Nominatim
  try {
    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ');
    const url4 = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}&limit=1&countrycodes=us`;
    console.log('🔍 Strategy 4 (OSM Public) URL:', url4);
    
    const response4 = await fetch(url4, {
      headers: { 'User-Agent': 'TruckingApp/1.0' }
    });
    
    if (response4.ok) {
      const data4 = await response4.json();
      if (data4 && data4.length > 0) {
        const result = {
          lat: parseFloat(data4[0].lat),
          lon: parseFloat(data4[0].lon),
          display_name: data4[0].display_name
        };
        console.log('✅ Strategy 4 (OSM Public) success:', result);
        return result;
      }
    }
  } catch (error) {
    console.log('⚠️ Strategy 4 failed:', error);
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Terminal coordinates (yard location)
const TERMINAL_LAT = 41.537855;
const TERMINAL_LON = -87.578633;

interface CalculateMilesRequest {
  pickupLat: number;
  pickupLon: number;
  deliveryLat: number;
  deliveryLon: number;
}

async function getRouteDistance(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number,
  supabase: any
): Promise<number | null> {
  // Round coordinates for cache lookup
  const roundLat = (lat: number) => Math.round(lat * 100000) / 100000;
  
  // Check cache first
  const { data: cached } = await supabase
    .from('route_cache')
    .select('distance_miles, created_at')
    .eq('start_lat', roundLat(startLat))
    .eq('start_lon', roundLat(startLon))
    .eq('end_lat', roundLat(endLat))
    .eq('end_lon', roundLat(endLon))
    .maybeSingle();

  if (cached) {
    const cacheAge = Date.now() - new Date(cached.created_at).getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    if (cacheAge < thirtyDaysMs) {
      console.log('✅ Route cache hit');
      return cached.distance_miles;
    }
  }

  try {
    // Use OSRM API (free, no API key needed)
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false&alternatives=false&steps=false`;
    
    console.log(`Calculating route from (${startLat}, ${startLon}) to (${endLat}, ${endLon})`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`OSRM API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      const distanceMeters = data.routes[0].distance;
      const distanceMiles = Math.round(distanceMeters / 1609.34);
      console.log(`Route distance: ${distanceMiles} miles`);
      
      // Store in cache
      await supabase
        .from('route_cache')
        .insert({
          start_lat: roundLat(startLat),
          start_lon: roundLat(startLon),
          end_lat: roundLat(endLat),
          end_lon: roundLat(endLon),
          distance_miles: distanceMiles,
          distance_meters: distanceMeters,
        });
      
      return distanceMiles;
    }
    
    console.error("No routes found in OSRM response");
    return null;
  } catch (error) {
    console.error("Error calculating route:", error);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: CalculateMilesRequest = await req.json();
    const { pickupLat, pickupLon, deliveryLat, deliveryLon } = body;

    console.log("Calculating yard transfer miles:", {
      pickup: { lat: pickupLat, lon: pickupLon },
      terminal: { lat: TERMINAL_LAT, lon: TERMINAL_LON },
      delivery: { lat: deliveryLat, lon: deliveryLon },
    });

    // Validate inputs
    if (!pickupLat || !pickupLon || !deliveryLat || !deliveryLon) {
      return new Response(
        JSON.stringify({ error: "Missing required coordinates" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client for cache
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    // Calculate original miles: Pickup → Terminal
    const originalMiles = await getRouteDistance(pickupLat, pickupLon, TERMINAL_LAT, TERMINAL_LON, supabase);
    
    // Calculate recovery miles: Terminal → Delivery
    const recoveryMiles = await getRouteDistance(TERMINAL_LAT, TERMINAL_LON, deliveryLat, deliveryLon, supabase);

    console.log("Mile calculations complete:", { originalMiles, recoveryMiles });

    return new Response(
      JSON.stringify({
        originalMiles: originalMiles || 0,
        recoveryMiles: recoveryMiles || 0,
        terminalLat: TERMINAL_LAT,
        terminalLon: TERMINAL_LON,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in calculate-yard-transfer-miles:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

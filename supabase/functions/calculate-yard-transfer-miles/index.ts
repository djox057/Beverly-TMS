import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  endLon: number
): Promise<number | null> {
  const mapboxToken = Deno.env.get("MAPBOX_ACCESS_TOKEN");
  
  if (!mapboxToken) {
    console.error("MAPBOX_ACCESS_TOKEN not configured");
    return null;
  }

  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${startLon},${startLat};${endLon},${endLat}?access_token=${mapboxToken}&overview=false`;
    
    console.log(`Calculating route from (${startLat}, ${startLon}) to (${endLat}, ${endLon})`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Mapbox API error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.routes && data.routes.length > 0) {
      const distanceMeters = data.routes[0].distance;
      const distanceMiles = Math.round(distanceMeters / 1609.34);
      console.log(`Route distance: ${distanceMiles} miles`);
      return distanceMiles;
    }
    
    console.error("No routes found in Mapbox response");
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

    // Calculate original miles: Pickup → Terminal
    const originalMiles = await getRouteDistance(pickupLat, pickupLon, TERMINAL_LAT, TERMINAL_LON);
    
    // Calculate recovery miles: Terminal → Delivery
    const recoveryMiles = await getRouteDistance(TERMINAL_LAT, TERMINAL_LON, deliveryLat, deliveryLon);

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

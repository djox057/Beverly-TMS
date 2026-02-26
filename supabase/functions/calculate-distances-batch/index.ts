import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TruckRequest {
  truck_number: string;
  current_lat: number;
  current_lon: number;
  destination_lat: number;
  destination_lon: number;
}

interface TruckResult {
  truck_number: string;
  miles_away: number;
}

/**
 * Haversine distance (pure math, no external API)
 * Returns straight-line distance in miles between two coordinates
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET for scheduled job authentication
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized request - invalid or missing CRON_SECRET');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { trucks } = await req.json() as { trucks: TruckRequest[] };
    
    if (!trucks || !Array.isArray(trucks)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: trucks array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📍 Processing ${trucks.length} trucks for distance calculation (Haversine × 1.3)`);

    // Pure math — no batching or delays needed
    const results: TruckResult[] = trucks.map((truck) => {
      const straightLine = haversineDistance(
        truck.current_lat, truck.current_lon,
        truck.destination_lat, truck.destination_lon
      );
      return {
        truck_number: truck.truck_number,
        miles_away: Math.round(straightLine * 1.3),
      };
    });

    console.log(`✅ Calculated distances for ${results.length}/${trucks.length} trucks`);

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in calculate-distances-batch:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

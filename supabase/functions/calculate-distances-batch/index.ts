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

async function calculateDistance(
  startLat: number,
  startLon: number,
  endLat: number,
  endLon: number
): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`OSRM error: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) {
      console.error(`OSRM no route: ${data.code}`);
      return null;
    }
    
    // Convert meters to miles
    const distanceMeters = data.routes[0].distance;
    const distanceMiles = Math.round(distanceMeters / 1609.344);
    
    return distanceMiles;
  } catch (error) {
    console.error(`Distance calc error:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { trucks } = await req.json() as { trucks: TruckRequest[] };
    
    if (!trucks || !Array.isArray(trucks)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: trucks array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📍 Processing ${trucks.length} trucks for distance calculation`);

    // Process in batches of 10 to avoid rate limits
    const results: TruckResult[] = [];
    const batchSize = 10;
    
    for (let i = 0; i < trucks.length; i += batchSize) {
      const batch = trucks.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (truck) => {
        const miles = await calculateDistance(
          truck.current_lat,
          truck.current_lon,
          truck.destination_lat,
          truck.destination_lon
        );
        
        if (miles !== null) {
          return {
            truck_number: truck.truck_number,
            miles_away: miles
          };
        }
        return null;
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r): r is TruckResult => r !== null));
      
      // Small delay between batches to be nice to OSRM
      if (i + batchSize < trucks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Coordinates {
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
}

interface RouteRequest {
  start: Coordinates;
  end: Coordinates;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { start, end }: RouteRequest = await req.json();

    console.log('🔍 Received coordinates:', { start, end });

    // Normalize coordinates - accept both lat/lon and latitude/longitude formats
    const startLat = start.lat ?? start.latitude;
    const startLon = start.lon ?? start.longitude;
    const endLat = end.lat ?? end.latitude;
    const endLon = end.lon ?? end.longitude;

    if (typeof startLat !== 'number' || typeof startLon !== 'number' 
        || typeof endLat !== 'number' || typeof endLon !== 'number') {
      console.error('❌ Invalid coordinates:', { start, end });
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call OSRM API from server side (no CORS issues)
    // OSRM format is: longitude,latitude (note the order!)
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false&alternatives=false&steps=false`;
    
    console.log('📍 Calling OSRM:', osrmUrl);
    
    const response = await fetch(osrmUrl);
    
    if (!response.ok) {
      console.error('OSRM API error:', response.status);
      return new Response(
        JSON.stringify({ error: 'OSRM API request failed', status: response.status }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    console.log('✅ OSRM response received');

    if (data.routes && data.routes.length > 0) {
      const distanceInMeters = data.routes[0].distance;
      const distanceInMiles = Math.round(distanceInMeters * 0.000621371);
      
      return new Response(
        JSON.stringify({
          success: true,
          distance: distanceInMiles,
          distanceMeters: distanceInMeters,
          duration: data.routes[0].duration
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'No route found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in calculate-route function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

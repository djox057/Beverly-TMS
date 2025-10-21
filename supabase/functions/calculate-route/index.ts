import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RouteRequest {
  start: {
    latitude: number;
    longitude: number;
  };
  end: {
    latitude: number;
    longitude: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { start, end }: RouteRequest = await req.json();

    console.log('🔍 Received coordinates:', { start, end });

    if (!start || !end || typeof start.latitude !== 'number' || typeof start.longitude !== 'number' 
        || typeof end.latitude !== 'number' || typeof end.longitude !== 'number') {
      console.error('❌ Invalid coordinates:', { start, end });
      return new Response(
        JSON.stringify({ error: 'Invalid coordinates provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call OSRM API from server side (no CORS issues)
    // OSRM format is: longitude,latitude (note the order!)
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?overview=false&alternatives=false&steps=false`;
    
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
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

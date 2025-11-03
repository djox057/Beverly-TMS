import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

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
  start?: Coordinates;
  end?: Coordinates;
  routes?: Array<{ start: Coordinates; end: Coordinates }>; // Support batch requests
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { start, end, routes }: RouteRequest = await req.json();

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const roundLat = (lat: number) => Math.round(lat * 100000) / 100000;

    // Handle batch requests
    if (routes && Array.isArray(routes)) {
      console.log(`🔍 Batch calculating ${routes.length} routes`);
      
      const results = await Promise.all(
        routes.map(async ({ start: s, end: e }) => {
          try {
            const startLat = s.lat ?? s.latitude;
            const startLon = s.lon ?? s.longitude;
            const endLat = e.lat ?? e.latitude;
            const endLon = e.lon ?? e.longitude;

            if (typeof startLat !== 'number' || typeof startLon !== 'number' 
                || typeof endLat !== 'number' || typeof endLon !== 'number') {
              return { success: false, error: 'Invalid coordinates' };
            }
            
            // Check cache
            const { data: cached } = await supabase
              .from('route_cache')
              .select('distance_miles, duration_seconds')
              .eq('start_lat', roundLat(startLat))
              .eq('start_lon', roundLat(startLon))
              .eq('end_lat', roundLat(endLat))
              .eq('end_lon', roundLat(endLon))
              .maybeSingle();
            
            if (cached) {
              supabase
                .from('route_cache')
                .update({ hit_count: (cached as any).hit_count + 1 })
                .eq('start_lat', roundLat(startLat))
                .eq('start_lon', roundLat(startLon))
                .eq('end_lat', roundLat(endLat))
                .eq('end_lon', roundLat(endLon))
                .then();
              
              return {
                success: true,
                distance: cached.distance_miles,
                duration: cached.duration_seconds,
                cached: true
              };
            }

            // Call OSRM
            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false&alternatives=false&steps=false`;
            const response = await fetch(osrmUrl);
            
            if (!response.ok) {
              return { success: false, error: 'OSRM API failed' };
            }

            const data = await response.json();
            
            if (data.routes && data.routes.length > 0) {
              const distanceInMeters = data.routes[0].distance;
              const distanceInMiles = Math.round(distanceInMeters * 0.000621371);
              const duration = data.routes[0].duration;
              
              supabase
                .from('route_cache')
                .insert({
                  start_lat: roundLat(startLat),
                  start_lon: roundLat(startLon),
                  end_lat: roundLat(endLat),
                  end_lon: roundLat(endLon),
                  distance_miles: distanceInMiles,
                  distance_meters: distanceInMeters,
                  duration_seconds: duration
                })
                .then();
              
              return {
                success: true,
                distance: distanceInMiles,
                duration: duration,
                cached: false
              };
            }

            return { success: false, error: 'No route found' };
          } catch (error) {
            return { success: false, error: String(error) };
          }
        })
      );
      
      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle single route request (original behavior)
    if (!start || !end) {
      return new Response(
        JSON.stringify({ error: 'Start and end coordinates required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('🔍 Received coordinates:', { start, end });

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
    
    // Check cache first
    const { data: cached } = await supabase
      .from('route_cache')
      .select('distance_miles, duration_seconds')
      .eq('start_lat', roundLat(startLat))
      .eq('start_lon', roundLat(startLon))
      .eq('end_lat', roundLat(endLat))
      .eq('end_lon', roundLat(endLon))
      .maybeSingle();
    
    if (cached) {
      console.log('✅ Route cache hit');
      supabase
        .from('route_cache')
        .update({ hit_count: (cached as any).hit_count + 1 })
        .eq('start_lat', roundLat(startLat))
        .eq('start_lon', roundLat(startLon))
        .eq('end_lat', roundLat(endLat))
        .eq('end_lon', roundLat(endLon))
        .then();
      
      return new Response(
        JSON.stringify({
          success: true,
          distance: cached.distance_miles,
          distanceMeters: (cached.distance_miles as any) * 1609.34,
          duration: cached.duration_seconds
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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
      const duration = data.routes[0].duration;
      
      supabase
        .from('route_cache')
        .insert({
          start_lat: roundLat(startLat),
          start_lon: roundLat(startLon),
          end_lat: roundLat(endLat),
          end_lon: roundLat(endLon),
          distance_miles: distanceInMiles,
          distance_meters: distanceInMeters,
          duration_seconds: duration
        })
        .then();
      
      return new Response(
        JSON.stringify({
          success: true,
          distance: distanceInMiles,
          distanceMeters: distanceInMeters,
          duration: duration
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RouteRequest {
  type: 'geocode' | 'route' | 'multi-stop-route';
  address?: string;
  start?: { lat: number; lon: number };
  end?: { lat: number; lon: number };
  coordinates?: { lat: number; lon: number }[];
}

async function geocodeAddress(address: string, mapboxToken: string, supabase: any): Promise<{ lat: number; lon: number } | null> {
  // Only cache addresses that are specific enough (contain comma = have city/state info)
  const isAddressSpecific = address.includes(',') && address.length > 20;
  
  // Check cache first - but only for specific addresses
  if (isAddressSpecific) {
    const { data: cached } = await supabase
      .from('geocoding_cache')
      .select('latitude, longitude, hit_count, created_at')
      .eq('address', address)
      .maybeSingle();

    if (cached) {
      const cacheAge = Date.now() - new Date(cached.created_at).getTime();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      
      if (cacheAge < thirtyDaysMs) {
        console.log('✅ Cache hit for:', address);
        return { lat: cached.latitude, lon: cached.longitude };
      }
    }
  }

  const encodedAddress = encodeURIComponent(address);
  console.log('📍 Geocoding address with Mapbox:', address);
  
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=1&country=US`
  );
  
  if (!response.ok) {
    console.error('📍 Geocoding failed with status:', response.status);
    return null;
  }
  
  const data = await response.json();
  
  if (data.features && data.features.length > 0) {
    const [lon, lat] = data.features[0].center;
    const placeName = data.features[0].place_name;
    console.log('📍 Geocoded result:', placeName, '→', { lat, lon });

    // Only cache specific addresses (with city/state info) to avoid caching ambiguous partial addresses
    if (isAddressSpecific) {
      supabase
        .from('geocoding_cache')
        .insert({ address, latitude: lat, longitude: lon })
        .then(() => {})
        .catch(() => {});
    } else {
      console.log('📍 Skipping cache for non-specific address:', address);
    }

    return { lat, lon };
  }
  
  console.warn('📍 No geocoding results for:', address);
  return null;
}

async function getRouteDistance(
  start: { lat: number; lon: number }, 
  end: { lat: number; lon: number }, 
  mapboxToken: string
): Promise<number | null> {
  const coordinates = `${start.lon},${start.lat};${end.lon},${end.lat}`;
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?access_token=${mapboxToken}`
  );
  
  if (!response.ok) {
    console.error('Mapbox directions failed with status:', response.status);
    return null;
  }
  
  const data = await response.json();
  
  if (data.routes && data.routes.length > 0) {
    const distanceInMeters = data.routes[0].distance;
    const distanceInMiles = Math.round(distanceInMeters / 1609.344);
    return distanceInMiles;
  }
  
  return null;
}

async function getMultiStopRouteDistance(
  coordinates: { lat: number; lon: number }[], 
  mapboxToken: string
): Promise<number | null> {
  if (coordinates.length < 2) return null;
  
  const coordString = coordinates.map(c => `${c.lon},${c.lat}`).join(';');
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?access_token=${mapboxToken}`
  );
  
  if (!response.ok) {
    console.error('Mapbox multi-stop directions failed with status:', response.status);
    return null;
  }
  
  const data = await response.json();
  
  if (data.routes && data.routes.length > 0) {
    const distanceInMeters = data.routes[0].distance;
    const distanceInMiles = Math.round(distanceInMeters / 1609.344);
    return distanceInMiles;
  }
  
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
    
    if (!mapboxToken) {
      console.error('MAPBOX_PUBLIC_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Mapbox token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl!, supabaseKey!);

    const body: RouteRequest = await req.json();
    console.log('📍 Route request:', body.type);

    if (body.type === 'geocode' && body.address) {
      const coords = await geocodeAddress(body.address, mapboxToken, supabase);
      return new Response(
        JSON.stringify({ success: !!coords, coordinates: coords }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.type === 'route' && body.start && body.end) {
      const miles = await getRouteDistance(body.start, body.end, mapboxToken);
      return new Response(
        JSON.stringify({ success: miles !== null, miles }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (body.type === 'multi-stop-route' && body.coordinates && body.coordinates.length >= 2) {
      const miles = await getMultiStopRouteDistance(body.coordinates, mapboxToken);
      return new Response(
        JSON.stringify({ success: miles !== null, miles }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid request type or missing parameters' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Route calculation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

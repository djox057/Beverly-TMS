import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

async function geocodeAddress(address: string, mapboxToken: string): Promise<{ lat: number; lon: number } | null> {
  const US_STATES = new Set([
    'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
    'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
    'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC','PR'
  ]);

  // Detect a trailing US state code in the input (e.g. "Centerville, MO" or "Centerville MO")
  let stateCode: string | null = null;
  const trimmed = address.trim();
  const m = trimmed.match(/[,\s]+([A-Za-z]{2})\s*$/);
  if (m && US_STATES.has(m[1].toUpperCase())) {
    stateCode = m[1].toUpperCase();
  }

  const encodedAddress = encodeURIComponent(address);
  console.log('📍 Geocoding address with Mapbox:', address, stateCode ? `(state filter: ${stateCode})` : '');

  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${mapboxToken}&limit=5&country=US&types=place,locality,region,postcode,address`
  );

  if (!response.ok) {
    console.error('📍 Geocoding failed with status:', response.status);
    return null;
  }

  const data = await response.json();

  if (data.features && data.features.length > 0) {
    let chosen = data.features[0];
    if (stateCode) {
      const match = data.features.find((f: any) => {
        if (f?.properties?.short_code?.toUpperCase?.() === `US-${stateCode}`) return true;
        const ctx = Array.isArray(f?.context) ? f.context : [];
        return ctx.some((c: any) => c?.short_code?.toUpperCase?.() === `US-${stateCode}`);
      });
      if (match) {
        chosen = match;
        console.log('📍 State filter matched feature:', match.place_name);
      } else {
        console.warn('📍 No feature matched state filter', stateCode, '— falling back to top result');
      }
    }
    const [lon, lat] = chosen.center;
    console.log('📍 Geocoded result:', chosen.place_name, '→', { lat, lon });
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

    const body: RouteRequest = await req.json();
    console.log('📍 Route request:', body.type);

    if (body.type === 'geocode' && body.address) {
      const coords = await geocodeAddress(body.address, mapboxToken);
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

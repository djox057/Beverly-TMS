import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Address {
  address: string;
  type: string;
}

serve(async (req) => {
  console.log('Geocode and calculate distance function called, method:', req.method);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        status: 405, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const { addresses }: { addresses: Address[] } = await req.json();
    console.log('Received addresses:', addresses);

    if (!addresses || addresses.length < 2) {
      return new Response(
        JSON.stringify({ error: 'At least 2 addresses required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Geocode each address using Nominatim
    const coordinates = [];
    for (const addr of addresses) {
      try {
        console.log('Geocoding address:', addr.address);
        const encodedAddress = encodeURIComponent(addr.address);
        console.log('Encoded address for Nominatim:', encodedAddress);
        
        const response = await fetch(`https://nominatim.jonworgen.cloudns.be/search?format=json&addressdetails=1&limit=1&q=${encodedAddress}`);
        
        if (!response.ok) {
          console.error(`Nominatim API returned ${response.status} for address: ${addr.address}`);
          continue;
        }
        
        const data = await response.json();
        console.log('Nominatim response for address:', addr.address, data);
        
        if (data && data.length > 0) {
          coordinates.push([parseFloat(data[0].lon), parseFloat(data[0].lat)]);
          console.log('Successfully geocoded:', addr.address, 'to', [data[0].lon, data[0].lat]);
        } else {
          console.log('No results from Nominatim for address:', addr.address);
        }
      } catch (error) {
        console.error('Geocoding failed for address:', addr.address, error);
      }
    }

    console.log('Total coordinates found:', coordinates.length);
    
    if (coordinates.length < 2) {
      return new Response(
        JSON.stringify({ 
          error: 'Could not geocode enough addresses',
          geocoded: coordinates.length,
          required: 2
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Calculate route distance using OSRM
    try {
      console.log('Calculating route distance with coordinates:', coordinates);
      const osrmCoords = coordinates.map(coord => `${coord[0]},${coord[1]}`).join(';');
      const osrmUrl = `https://osrm.jonworgen.cloudns.be/route/v1/driving/${osrmCoords}?overview=false&alternatives=false&steps=false`;
      console.log('OSRM URL:', osrmUrl);
      
      const osrmResponse = await fetch(osrmUrl);
      
      if (!osrmResponse.ok) {
        console.error('OSRM API error:', osrmResponse.status, await osrmResponse.text());
        throw new Error(`OSRM API returned ${osrmResponse.status}`);
      }
      
      const osrmData = await osrmResponse.json();
      console.log('OSRM response:', osrmData);
      
      if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
        const distanceInMeters = osrmData.routes[0].distance;
        const distanceInKm = distanceInMeters / 1000;
        const distanceInMiles = distanceInKm * 0.621371;
        
        console.log(`Distance calculated: ${distanceInKm} km (${distanceInMiles} miles)`);
        
        return new Response(
          JSON.stringify({ 
            success: true,
            distance: {
              meters: distanceInMeters,
              km: distanceInKm,
              miles: distanceInMiles
            }
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      } else {
        console.error('OSRM returned no routes or error:', osrmData);
        throw new Error('OSRM could not calculate route');
      }
    } catch (error) {
      console.error('OSRM calculation failed:', error);
      return new Response(
        JSON.stringify({ 
          error: 'Route calculation failed',
          details: error.message
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

  } catch (error) {
    console.error('Error in geocode-and-calculate-distance function:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error.message
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
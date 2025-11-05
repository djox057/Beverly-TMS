import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SamsaraLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  time: string;
  speed?: number;
  heading?: number;
}

async function fetchSamsaraLocations(apiKey: string): Promise<SamsaraLocation[]> {
  const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Samsara API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  return data.data.map((vehicle: any) => ({
    id: vehicle.id,
    name: vehicle.name,
    latitude: vehicle.gps?.latitude,
    longitude: vehicle.gps?.longitude,
    time: vehicle.gps?.time,
    speed: vehicle.gps?.speedMilesPerHour,
    heading: vehicle.gps?.headingDegrees,
  }));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🌍 Fetching Samsara vehicle locations...');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1');
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2');

    if (!apiKey1 && !apiKey2) {
      throw new Error('No Samsara API keys configured');
    }

    const allLocations: SamsaraLocation[] = [];
    
    // Fetch from API key 1
    if (apiKey1) {
      try {
        console.log('📡 Fetching from API key 1...');
        const locations1 = await fetchSamsaraLocations(apiKey1);
        allLocations.push(...locations1);
        console.log(`✅ Got ${locations1.length} locations from API key 1`);
      } catch (error) {
        console.error('Error fetching from API key 1:', error);
      }
    }

    // Fetch from API key 2
    if (apiKey2) {
      try {
        console.log('📡 Fetching from API key 2...');
        const locations2 = await fetchSamsaraLocations(apiKey2);
        allLocations.push(...locations2);
        console.log(`✅ Got ${locations2.length} locations from API key 2`);
      } catch (error) {
        console.error('Error fetching from API key 2:', error);
      }
    }

    console.log(`📍 Total locations fetched: ${allLocations.length}`);

    // Get all trucks to match Samsara vehicles
    const { data: trucks, error: trucksError } = await supabaseClient
      .from('trucks')
      .select('id, truck_number, samsara_vehicle_id, samsara_vehicle_name');

    if (trucksError) {
      throw trucksError;
    }

    // Match locations to trucks and save
    let savedCount = 0;
    for (const location of allLocations) {
      if (!location.latitude || !location.longitude) continue;

      // Find matching truck by Samsara ID or name
      const truck = trucks?.find(
        (t: any) => t.samsara_vehicle_id === location.id || 
                    t.samsara_vehicle_name === location.name
      );

      if (truck) {
        const { error: insertError } = await supabaseClient
          .from('truck_locations')
          .insert({
            truck_id: truck.id,
            truck_number: truck.truck_number,
            latitude: location.latitude,
            longitude: location.longitude,
            location_timestamp: location.time,
            samsara_vehicle_id: location.id,
            samsara_vehicle_name: location.name,
            speed: location.speed,
            heading: location.heading,
          });

        if (insertError) {
          console.error(`Error saving location for truck ${truck.truck_number}:`, insertError);
        } else {
          savedCount++;
        }
      }
    }

    console.log(`✅ Saved ${savedCount} truck locations`);

    return new Response(
      JSON.stringify({ 
        success: true,
        locations: allLocations.length,
        saved: savedCount,
        message: `Fetched ${allLocations.length} locations, saved ${savedCount}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Failed to fetch Samsara locations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

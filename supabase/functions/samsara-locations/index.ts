import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SamsaraVehicle {
  id: string;
  name: string;
  gps?: {
    latitude: number;
    longitude: number;
    time: string;
  };
}

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1');
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!apiKey1 || !apiKey2) {
      throw new Error('Samsara API keys not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all trucks from database
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select('id, truck_number');

    if (trucksError) {
      console.error('Error fetching trucks:', trucksError);
      throw trucksError;
    }

    const apiKeys = [apiKey1, apiKey2];
    const allLocations: TruckLocation[] = [];

    // Fetch vehicles from both Samsara accounts
    for (const apiKey of apiKeys) {
      try {
        const response = await fetch('https://api.samsara.com/fleet/vehicles', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`Samsara API error: ${response.status} ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        const vehicles: SamsaraVehicle[] = data.data || [];

        console.log(`Fetched ${vehicles.length} vehicles from Samsara`);

        // Match vehicles with trucks and extract locations
        for (const vehicle of vehicles) {
          // Samsara names are "TRUCK {truck_number}"
          const truckNumberMatch = vehicle.name.match(/TRUCK\s+(\d+)/i);
          if (!truckNumberMatch) continue;

          const truckNumber = truckNumberMatch[1];
          const matchingTruck = trucks?.find(t => t.truck_number === truckNumber);

          if (matchingTruck && vehicle.gps) {
            allLocations.push({
              truck_id: matchingTruck.id,
              truck_number: truckNumber,
              latitude: vehicle.gps.latitude,
              longitude: vehicle.gps.longitude,
              timestamp: vehicle.gps.time,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching from Samsara:', error);
      }
    }

    console.log(`Matched ${allLocations.length} truck locations`);

    return new Response(
      JSON.stringify({ locations: allLocations }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in samsara-locations function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

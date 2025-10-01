import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1');
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2');

    if (!apiKey1 || !apiKey2) {
      throw new Error('Samsara API keys not configured');
    }

    const apiKeys = [apiKey1, apiKey2];
    const allVehicles: any[] = [];

    // Fetch vehicles from both Samsara accounts
    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      try {
        const response = await fetch('https://api.samsara.com/fleet/vehicles', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          console.error(`Samsara API ${i + 1} error: ${response.status} ${response.statusText}`);
          continue;
        }

        const data = await response.json();
        const vehicles = data.data || [];

        console.log(`API Key ${i + 1}: Fetched ${vehicles.length} vehicles`);

        // Add API key identifier to each vehicle for debugging
        const vehiclesWithSource = vehicles.map((v: any) => ({
          ...v,
          apiSource: `API_KEY_${i + 1}`,
          vehicleId: v.id,
          vehicleName: v.name,
          hasGPS: !!v.gps,
          gpsData: v.gps || null
        }));

        allVehicles.push(...vehiclesWithSource);
      } catch (error) {
        console.error(`Error fetching from Samsara API ${i + 1}:`, error);
      }
    }

    console.log(`Total vehicles fetched: ${allVehicles.length}`);

    // Return comprehensive debug information
    return new Response(
      JSON.stringify({
        totalVehicles: allVehicles.length,
        vehicles: allVehicles,
        // Group by name patterns for easier analysis
        namePatterns: {
          withTRUCKPrefix: allVehicles.filter(v => /TRUCK/i.test(v.name)),
          withNumbers: allVehicles.filter(v => /\d{4}/.test(v.name)),
          all: allVehicles.map(v => v.name).sort()
        },
        sampleVehicles: allVehicles.slice(0, 10) // First 10 for quick inspection
      }, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in samsara-debug function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

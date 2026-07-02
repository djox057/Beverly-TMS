import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Location validation bounds (US Continental)
const LOCATION_BOUNDS = {
  minLat: 25.0,
  maxLat: 50.0,
  minLon: -125.0,
  maxLon: -65.0,
};

const MAX_LOCATION_AGE_MINUTES = 30;

interface TruckDistanceRequest {
  truck_number: string;
  truck_id: string;
  current_lat: number;
  current_lon: number;
  dest_lat: number;
  dest_lon: number;
}

interface TruckDistanceResponse {
  truck_number: string;
  miles_away: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET for scheduled job authentication
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized request - invalid or missing CRON_SECRET');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  console.log('🚀 Starting batch truck distance calculation...');

  try {
    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1');
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2');
    const apiKey3 = Deno.env.get('SAMSARA_API_KEY_3');
    const apiKey4 = Deno.env.get('SAMSARA_API_KEY_4');
    const apiKey5 = Deno.env.get('SAMSARA_API_KEY_5');
    const apiKey6 = Deno.env.get('SAMSARA_API_KEY_6');
    const apiKeys = [apiKey1, apiKey2, apiKey3, apiKey4, apiKey5, apiKey6].filter(Boolean) as string[];
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const externalServiceUrl = Deno.env.get('DISTANCE_SERVICE_URL');

    if (apiKeys.length === 0) {
      throw new Error('Samsara API keys not configured');
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!);

    // Step 1: Fetch all truck locations from Samsara
    console.log('📍 Step 1: Fetching truck locations from Samsara...');
    const truckLocations = await fetchSamsaraLocations(apiKeys);
    console.log(`✅ Got ${truckLocations.size} truck locations from Samsara`);

    // Step 2: Fetch trucks with active orders and their destination coordinates
    console.log('🔍 Step 2: Fetching trucks with active orders...');
    const { data: trucksWithOrders, error: trucksError } = await supabase
      .from('trucks')
      .select(`
        id,
        truck_number,
        status,
        orders!orders_truck_id_fkey (
          id,
          status,
          pickup_datetime,
          delivery_datetime,
          pickup_drops (
            id,
            type,
            sequence_number,
            latitude,
            longitude,
            city,
            state
          )
        )
      `)
      .not('driver1_id', 'is', null)
      .in('status', ['in_transit', 'available', 'pending']);

    if (trucksError) {
      console.error('❌ Error fetching trucks:', trucksError);
      throw trucksError;
    }

    console.log(`✅ Found ${trucksWithOrders?.length || 0} trucks with potential active orders`);

    // Step 3: Build the batch payload
    console.log('📦 Step 3: Building batch payload...');
    const batchPayload: TruckDistanceRequest[] = [];

    for (const truck of trucksWithOrders || []) {
      const truckLocation = truckLocations.get(truck.truck_number);
      if (!truckLocation) {
        console.log(`⏭️ Skipping ${truck.truck_number}: No Samsara location`);
        continue;
      }

      // Find the current active order (in_transit first, then pending by earliest pickup)
      const orders = (truck.orders || []) as any[];
      const activeOrder = orders
        .filter((o: any) => o.status === 'in_transit' || o.status === 'pending')
        .sort((a: any, b: any) => {
          if (a.status === 'in_transit' && b.status !== 'in_transit') return -1;
          if (b.status === 'in_transit' && a.status !== 'in_transit') return 1;
          return new Date(a.pickup_datetime).getTime() - new Date(b.pickup_datetime).getTime();
        })[0];

      if (!activeOrder) {
        console.log(`⏭️ Skipping ${truck.truck_number}: No active order`);
        continue;
      }

      // Determine destination based on order status
      const pickupDrops = (activeOrder.pickup_drops || []) as any[];
      let destination: { lat: number; lon: number; city?: string; state?: string } | null = null;

      if (activeOrder.status === 'in_transit') {
        // For in_transit, destination is the next delivery
        const deliveries = pickupDrops
          .filter((pd: any) => pd.type === 'delivery')
          .sort((a: any, b: any) => a.sequence_number - b.sequence_number);
        
        const nextDelivery = deliveries[0];
        if (nextDelivery?.latitude && nextDelivery?.longitude) {
          destination = {
            lat: nextDelivery.latitude,
            lon: nextDelivery.longitude,
            city: nextDelivery.city,
            state: nextDelivery.state,
          };
        }
      } else if (activeOrder.status === 'pending') {
        // For pending, destination is the first pickup
        const pickups = pickupDrops
          .filter((pd: any) => pd.type === 'pickup')
          .sort((a: any, b: any) => a.sequence_number - b.sequence_number);
        
        const firstPickup = pickups[0];
        if (firstPickup?.latitude && firstPickup?.longitude) {
          destination = {
            lat: firstPickup.latitude,
            lon: firstPickup.longitude,
            city: firstPickup.city,
            state: firstPickup.state,
          };
        }
      }

      if (!destination) {
        console.log(`⏭️ Skipping ${truck.truck_number}: No destination coordinates (order ${activeOrder.id})`);
        continue;
      }

      batchPayload.push({
        truck_number: truck.truck_number,
        truck_id: truck.id,
        current_lat: truckLocation.latitude,
        current_lon: truckLocation.longitude,
        dest_lat: destination.lat,
        dest_lon: destination.lon,
      });

      console.log(`✅ Added ${truck.truck_number}: (${truckLocation.latitude.toFixed(4)}, ${truckLocation.longitude.toFixed(4)}) → ${destination.city || ''}, ${destination.state || ''}`);
    }

    console.log(`📦 Batch payload ready: ${batchPayload.length} trucks`);

    // Step 4: Send to external service or calculate locally
    let distanceResults: TruckDistanceResponse[] = [];

    if (externalServiceUrl) {
      console.log(`🌐 Step 4: Sending batch to external service: ${externalServiceUrl}`);
      try {
        const response = await fetch(externalServiceUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trucks: batchPayload }),
        });

        if (!response.ok) {
          throw new Error(`External service error: ${response.status}`);
        }

        const result = await response.json();
        distanceResults = result.trucks || [];
        console.log(`✅ Received ${distanceResults.length} distance results from external service`);
      } catch (error) {
        console.error('❌ External service failed:', error);
        // Return payload info so user knows what to process externally
        return new Response(
          JSON.stringify({
            success: false,
            error: 'External service unavailable',
            payload: batchPayload,
            message: 'Process this payload with your external routing service',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      console.log('⚠️ No DISTANCE_SERVICE_URL configured - returning payload only');
      return new Response(
        JSON.stringify({
          success: true,
          payload: batchPayload,
          count: batchPayload.length,
          message: 'No external service configured. Set DISTANCE_SERVICE_URL secret to enable automatic distance calculation.',
          duration_ms: Date.now() - startTime,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Update trucks.miles_away in database
    console.log('💾 Step 5: Updating miles_away in database...');
    let updateCount = 0;

    for (const result of distanceResults) {
      const truck = batchPayload.find(t => t.truck_number === result.truck_number);
      if (!truck) continue;

      const { error: updateError } = await supabase
        .from('trucks')
        .update({ miles_away: Math.round(result.miles_away) })
        .eq('id', truck.truck_id);

      if (updateError) {
        console.error(`❌ Failed to update ${result.truck_number}:`, updateError);
      } else {
        updateCount++;
      }
    }

    console.log(`✅ Updated ${updateCount} trucks with miles_away`);

    const duration = Date.now() - startTime;
    console.log(`🏁 Completed in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        trucks_processed: batchPayload.length,
        trucks_updated: updateCount,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in get-truck-distances-batch:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Fetch truck locations from Samsara APIs
 */
async function fetchSamsaraLocations(apiKeys: string[]): Promise<Map<string, { latitude: number; longitude: number }>> {
  const allVehicles: any[] = [];

  for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
    const apiKey = apiKeys[keyIndex];
    
    try {
      const response = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        console.error(`Samsara API ${keyIndex + 1} error: ${response.status}`);
        continue;
      }

      const data = await response.json();
      const vehicles = data.data || [];
      console.log(`📡 Samsara API ${keyIndex + 1}: ${vehicles.length} vehicles`);
      allVehicles.push(...vehicles);
    } catch (error) {
      console.error(`Error fetching from Samsara API ${keyIndex + 1}:`, error);
    }
  }

  // Build location map with flexible truck matching
  const locationMap = new Map<string, { latitude: number; longitude: number }>();

  for (const vehicle of allVehicles) {
    const location = vehicle.location || vehicle.gps;
    if (!location?.latitude || !location?.longitude) continue;
    
    // Validate bounds
    if (!validateLocationBounds(location.latitude, location.longitude)) continue;

    // Check age
    if (location.time) {
      const ageMinutes = (Date.now() - new Date(location.time).getTime()) / 1000 / 60;
      if (ageMinutes > MAX_LOCATION_AGE_MINUTES) continue;
    }

    // Extract truck number from vehicle name
    const truckNumber = extractTruckNumber(vehicle.name);
    if (truckNumber) {
      locationMap.set(truckNumber, {
        latitude: location.latitude,
        longitude: location.longitude,
      });
    }
  }

  return locationMap;
}

/**
 * Extract truck number from Samsara vehicle name
 */
function extractTruckNumber(name: string): string | null {
  if (!name) return null;
  
  // Match patterns like "TRUCK 1234", "TRUCK #1234", "1234"
  const match = name.match(/(?:TRUCK\s*#?\s*)?(\d{3,6})/i);
  return match ? match[1] : null;
}

/**
 * Validate location is within US bounds
 */
function validateLocationBounds(lat: number, lon: number): boolean {
  if (lat === 0 && lon === 0) return false;
  return !(
    lat < LOCATION_BOUNDS.minLat ||
    lat > LOCATION_BOUNDS.maxLat ||
    lon < LOCATION_BOUNDS.minLon ||
    lon > LOCATION_BOUNDS.maxLon
  );
}

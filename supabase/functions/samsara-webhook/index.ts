import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SamsaraWebhookPayload {
  eventType: string;
  eventId: string;
  eventMs: number;
  orgId: number;
  webhookId: string;
  event: {
    vehicle?: {
      id: string;
      name: string;
    };
    location?: {
      latitude: number;
      longitude: number;
      speedMilesPerHour?: number;
      heading?: number;
      time?: string;
    };
    text?: string; // For Ping events
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Samsara webhook received');
    
    const payload: SamsaraWebhookPayload = await req.json();
    console.log('📦 Webhook payload:', JSON.stringify(payload, null, 2));

    // Validate payload
    if (!payload.eventType || !payload.event) {
      console.error('❌ Invalid payload structure');
      return new Response(
        JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle Ping events
    if (payload.eventType === 'Ping') {
      console.log('✅ Ping event received');
      return new Response(
        JSON.stringify({ message: 'Ping acknowledged' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only process location events (VehicleUpdated, RouteStopArrival)
    const isLocationEvent = payload.eventType === 'VehicleUpdated' || 
                           payload.eventType === 'RouteStopArrival';
    
    if (!isLocationEvent) {
      console.log('ℹ️ Ignoring non-location event:', payload.eventType);
      return new Response(
        JSON.stringify({ message: 'Event type not processed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const vehicle = payload.event.vehicle;
    const location = payload.event.location;

    if (!vehicle || !location || !location.latitude || !location.longitude) {
      console.log('⚠️ No vehicle or location data in payload');
      return new Response(
        JSON.stringify({ message: 'No location data' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔍 Looking up truck for Samsara vehicle:', vehicle.name);

    // Find matching truck in database
    // Try multiple matching strategies
    const vehicleName = vehicle.name.toUpperCase();
    const truckNumber = vehicleName.replace(/TRUCK\s*/i, '').trim();
    
    console.log('🔍 Searching for truck numbers:', [vehicleName, truckNumber]);

    const { data: trucks, error: truckError } = await supabase
      .from('trucks')
      .select('id, truck_number')
      .or(`truck_number.eq.${vehicleName},truck_number.eq.${truckNumber}`);

    if (truckError) {
      console.error('❌ Error finding truck:', truckError);
      return new Response(
        JSON.stringify({ error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!trucks || trucks.length === 0) {
      console.log('⚠️ No matching truck found for:', vehicle.name);
      // Still return 200 to acknowledge webhook
      return new Response(
        JSON.stringify({ message: 'Truck not found, but webhook acknowledged' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const truck = trucks[0];
    console.log('✅ Found truck:', truck.truck_number, '(ID:', truck.id, ')');

    // Insert location data
    const locationData = {
      truck_id: truck.id,
      truck_number: truck.truck_number,
      latitude: location.latitude,
      longitude: location.longitude,
      location_timestamp: location.time || new Date().toISOString(),
      samsara_vehicle_id: vehicle.id,
      samsara_vehicle_name: vehicle.name,
      speed: location.speedMilesPerHour || null,
      heading: location.heading || null,
    };

    console.log('💾 Inserting location:', locationData);

    const { error: insertError } = await supabase
      .from('truck_locations')
      .insert(locationData);

    if (insertError) {
      console.error('❌ Error inserting location:', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store location' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('✅ Location stored successfully');

    // Also update miles_away in trucks table (in background)
    EdgeRuntime.waitUntil(
      updateTruckDistance(supabase, truck.id, location.latitude, location.longitude)
    );

    return new Response(
      JSON.stringify({ 
        message: 'Location updated',
        truck: truck.truck_number,
        coordinates: `${location.latitude}, ${location.longitude}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Background task to update truck distance
async function updateTruckDistance(
  supabase: any,
  truckId: string,
  latitude: number,
  longitude: number
) {
  try {
    // This would calculate distance to next delivery
    // For now, just log that we'd do this
    console.log(`🔄 Background: Would calculate distance for truck ${truckId}`);
  } catch (error) {
    console.error('Error updating truck distance:', error);
  }
}

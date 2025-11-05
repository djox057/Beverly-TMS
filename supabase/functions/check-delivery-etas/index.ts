import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Coordinates {
  latitude: number;
  longitude: number;
}

async function geocodeAddress(address: string, supabaseClient: any): Promise<Coordinates | null> {
  if (!address || address.trim() === '') {
    return null;
  }

  try {
    const { data, error } = await supabaseClient.functions.invoke('geocode-address', {
      body: { address }
    });

    if (error) {
      console.error('Geocoding failed:', error);
      return null;
    }

    if (data?.success) {
      return {
        latitude: data.latitude,
        longitude: data.longitude
      };
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

async function calculateRouteDuration(
  start: Coordinates,
  end: Coordinates,
  supabaseClient: any
): Promise<number | null> {
  try {
    const { data, error } = await supabaseClient.functions.invoke('calculate-route', {
      body: { start, end }
    });

    if (error) {
      console.error('Route calculation failed:', error);
      return null;
    }

    if (data?.success) {
      return data.duration;
    }

    return null;
  } catch (error) {
    console.error('Error calculating route:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Starting delivery ETA check...');
    
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get active orders with deliveries that are not completed
    const { data: orders, error: ordersError } = await supabaseClient
      .from('orders')
      .select(`
        id,
        internal_load_number,
        delivery_end_datetime,
        truck_id,
        pickup_drops!inner(
          address,
          city,
          state,
          zip,
          type
        )
      `)
      .eq('status', 'in_transit')
      .not('delivery_end_datetime', 'is', null)
      .order('delivery_end_datetime', { ascending: true });

    if (ordersError) {
      throw ordersError;
    }

    console.log(`📦 Found ${orders?.length || 0} active orders`);

    if (!orders || orders.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active orders to check', checked: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get truck locations
    const { data: locations, error: locationsError } = await supabaseClient
      .from('truck_locations')
      .select('truck_id, latitude, longitude, location_timestamp')
      .in('truck_id', orders.map((o: any) => o.truck_id).filter(Boolean));

    if (locationsError) {
      console.error('Error fetching truck locations:', locationsError);
    }

    const locationMap = new Map();
    if (locations) {
      for (const loc of locations) {
        if (!locationMap.has(loc.truck_id) || 
            new Date(loc.location_timestamp) > new Date(locationMap.get(loc.truck_id).location_timestamp)) {
          locationMap.set(loc.truck_id, loc);
        }
      }
    }

    let checkedCount = 0;
    let lateCount = 0;

    for (const order of orders) {
      if (!order.truck_id) continue;

      const truckLocation = locationMap.get(order.truck_id);
      if (!truckLocation) {
        console.log(`⚠️ No location data for truck ${order.truck_id}`);
        continue;
      }

      // Get delivery address
      const deliveryStop = order.pickup_drops.find((pd: any) => pd.type === 'delivery');
      if (!deliveryStop) continue;

      const deliveryAddress = `${deliveryStop.address}, ${deliveryStop.city}, ${deliveryStop.state} ${deliveryStop.zip}`;
      
      // Geocode delivery address
      const deliveryCoords = await geocodeAddress(deliveryAddress, supabaseClient);
      if (!deliveryCoords) {
        console.log(`⚠️ Could not geocode delivery address: ${deliveryAddress}`);
        continue;
      }

      // Calculate route duration
      const durationMinutes = await calculateRouteDuration(
        { latitude: truckLocation.latitude, longitude: truckLocation.longitude },
        deliveryCoords,
        supabaseClient
      );

      if (durationMinutes === null) {
        console.log(`⚠️ Could not calculate route for order ${order.internal_load_number}`);
        continue;
      }

      const estimatedArrival = new Date(Date.now() + durationMinutes * 60 * 1000);
      const deliveryDeadline = new Date(order.delivery_end_datetime);
      
      const isLate = estimatedArrival > deliveryDeadline;
      
      if (isLate) {
        lateCount++;
        console.log(`🚨 Order ${order.internal_load_number} is running late!`);
        console.log(`   ETA: ${estimatedArrival.toISOString()}`);
        console.log(`   Deadline: ${deliveryDeadline.toISOString()}`);
        console.log(`   Minutes late: ${Math.round((estimatedArrival.getTime() - deliveryDeadline.getTime()) / 60000)}`);
      }

      checkedCount++;
    }

    console.log(`✅ Checked ${checkedCount} orders, ${lateCount} running late`);

    return new Response(
      JSON.stringify({ 
        success: true,
        checked: checkedCount,
        late: lateCount,
        message: `Checked ${checkedCount} orders, ${lateCount} running late`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Failed to check ETAs:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

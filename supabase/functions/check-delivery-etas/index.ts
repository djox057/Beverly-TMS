import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { toZonedTime } from "npm:date-fns-tz@3.2.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function geocodeAddress(address: string) {
  if (!address || address.trim() === '') {
    return null;
  }

  try {
    // Use cached geocode-address edge function
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/geocode-address`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ address }),
      }
    );

    if (!response.ok) {
      console.error('Geocoding failed:', response.status);
      return null;
    }

    const data = await response.json();

    if (data?.success) {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
      };
    }

    return null;
  } catch (error) {
    console.error('Error geocoding address:', error);
    return null;
  }
}

async function calculateRouteDuration(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
) {
  try {
    // Use cached calculate-route edge function
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/calculate-route`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({
          start: {
            lat: start.latitude,
            lon: start.longitude,
          },
          end: {
            lat: end.latitude,
            lon: end.longitude,
          },
        }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data?.success && data.duration) {
      return data.duration; // Duration in seconds
    }

    return null;
  } catch (error) {
    console.error('Route duration calculation error:', error);
    return null;
  }
}

function parseSimpleDateTime(datetimeString: string) {
  const date = new Date(datetimeString);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hours: date.getHours(),
    minutes: date.getMinutes(),
  };
}

async function checkDeliveryETA(
  truckLocation: { latitude: number; longitude: number },
  deliveryAddress: string,
  deliveryEndDatetime: string
) {
  const defaultResult = {
    isLate: false,
    estimatedArrival: null,
    durationMinutes: null,
  };

  if (!truckLocation || !deliveryEndDatetime) {
    return defaultResult;
  }

  try {
    const deliveryCoords = await geocodeAddress(deliveryAddress);
    if (!deliveryCoords) {
      return defaultResult;
    }

    const durationSeconds = await calculateRouteDuration(truckLocation, deliveryCoords);
    if (!durationSeconds) {
      return defaultResult;
    }

    const durationMinutes = Math.ceil(durationSeconds / 60);
    const now = new Date();
    const chicagoNow = toZonedTime(now, 'America/Chicago');
    const estimatedArrival = new Date(chicagoNow.getTime() + durationSeconds * 1000);

    const parsed = parseSimpleDateTime(deliveryEndDatetime);
    const deliveryEndTime = new Date(
      parsed.year,
      parsed.month - 1,
      parsed.day,
      parsed.hours,
      parsed.minutes
    );

    const isLate = estimatedArrival > deliveryEndTime;

    return {
      isLate,
      estimatedArrival,
      durationMinutes,
    };
  } catch (error) {
    console.error('ETA calculation error:', error);
    return defaultResult;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    console.log('🔍 Fetching orders and truck locations...');

    // Get all orders with pickup/delivery stops and truck info - wrap in try-catch
    let orders: any[] = [];
    try {
      const { data: ordersData, error: ordersError } = await supabaseClient
        .from('orders')
        .select(
          `
          internal_load_number,
          truck_id,
          delivery_end_datetime,
          delivery_datetime,
          order_files(id, file_category),
          trucks!orders_truck_id_fkey(
            id,
            truck_number
          ),
          pickup_drops!inner(
            id,
            order_id,
            type,
            address,
            city,
            state,
            zip_code
          )
        `
        )
        .in('status', ['pending', 'in_transit'])
        .not('truck_id', 'is', null);

      if (ordersError) {
        console.error('⚠️ Error fetching orders:', ordersError);
        return new Response(
          JSON.stringify({
            success: true,
            results: [],
            error: 'Failed to fetch orders',
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      orders = ordersData || [];
    } catch (ordersException) {
      console.error('⚠️ Exception fetching orders:', ordersException);
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
          error: 'Exception fetching orders',
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log(`📦 Found ${orders.length} orders to check`);

    // Get truck locations from Samsara - don't fail if this errors
    let truckLocations: any[] = [];
    try {
      const { data: locationsData, error: locationsError } = await supabaseClient.functions.invoke(
        'samsara-locations'
      );

      if (locationsError) {
        console.error('⚠️ Error fetching locations (continuing anyway):', locationsError);
      } else {
        truckLocations = locationsData?.locations || [];
        console.log(`📍 Found ${truckLocations.length} truck locations`);
      }
    } catch (locationsException) {
      console.error('⚠️ Exception fetching locations (continuing anyway):', locationsException);
    }

    const results: any[] = [];

    // Ensure we always have valid data
    if (!orders || orders.length === 0) {
      console.log('⚠️ No orders to check');
      return new Response(
        JSON.stringify({
          success: true,
          results: [],
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    for (const order of orders) {
      try {
        // Only check orders with BOL but no POD (in transit)
        const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
        const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');

        if (!hasBOL || hasPOD) {
          continue;
        }

        // Find delivery stop
        const deliveryStop = order.pickup_drops?.find((stop: any) => stop.type === 'delivery');
        if (!deliveryStop?.address || !order.delivery_end_datetime) {
          continue;
        }

        // Skip if delivery date is in the past
        if (order.delivery_datetime) {
          const deliveryDate = new Date(order.delivery_datetime);
          const now = new Date();
          if (deliveryDate < now) {
            continue;
          }
        }

        // Get truck number from the joined trucks table
        const truckNumber = order.trucks?.truck_number;
        if (!truckNumber) {
          continue;
        }

        // Find truck location
        const truckLocation = truckLocations.find((loc) => loc.truck_number === truckNumber);
        if (!truckLocation) {
          console.log(`⏭️ No location for truck ${truckNumber}`);
          continue;
        }

        // Build full delivery address
        const deliveryAddress = [
          deliveryStop.address,
          deliveryStop.city,
          deliveryStop.state,
          deliveryStop.zip_code,
        ]
          .filter(Boolean)
          .join(', ');

        console.log(
          `⏱️ Calculating ETA for order ${order.internal_load_number} (Truck ${truckNumber})`
        );

        const etaResult = await checkDeliveryETA(
          {
            latitude: truckLocation.latitude,
            longitude: truckLocation.longitude,
          },
          deliveryAddress,
          order.delivery_end_datetime
        );

        results.push({
          internal_load_number: order.internal_load_number,
          is_late: etaResult.isLate,
          estimated_arrival: etaResult.estimatedArrival?.toISOString() || null,
          duration_minutes: etaResult.durationMinutes,
        });

        console.log(
          `${etaResult.isLate ? '🔶 LATE' : '✅ ON TIME'}: Order ${order.internal_load_number}`
        );
      } catch (orderError) {
        console.error(`❌ Error processing order ${order.internal_load_number}:`, orderError);
        // Continue with other orders
      }
    }

    console.log(`✅ Processed ${results.length} orders with ETA calculations`);

    return new Response(
      JSON.stringify({
        success: true,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

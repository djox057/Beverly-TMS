import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { toZonedTime } from 'https://esm.sh/date-fns-tz@3.2.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Coordinates {
  latitude: number;
  longitude: number;
}

interface OrderETA {
  internal_load_number: number;
  is_late: boolean;
  estimated_arrival: string | null;
  duration_minutes: number | null;
}

// Batch geocode multiple addresses at once
async function geocodeAddressesBatch(addresses: string[]): Promise<Map<string, Coordinates | null>> {
  const results = new Map<string, Coordinates | null>();
  
  if (addresses.length === 0) return results;

  try {
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/geocode-address`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ addresses }),
      }
    );

    if (!response.ok) {
      console.error('Batch geocoding failed:', response.status);
      return results;
    }

    const data = await response.json();
    
    if (data?.success && data.results) {
      for (const result of data.results) {
        if (result.success) {
          results.set(result.address, {
            latitude: result.latitude,
            longitude: result.longitude,
          });
        } else {
          results.set(result.address, null);
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Error batch geocoding addresses:', error);
    return results;
  }
}

// Batch calculate routes
async function calculateRoutesBatch(
  routes: Array<{ start: Coordinates; end: Coordinates }>
): Promise<Array<number | null>> {
  if (routes.length === 0) return [];

  try {
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/calculate-route`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ routes }),
      }
    );
    
    if (!response.ok) {
      return routes.map(() => null);
    }
    
    const data = await response.json();
    
    if (data?.success && data.results) {
      return data.results.map((r: any) => r.success ? r.duration : null);
    }
    
    return routes.map(() => null);
  } catch (error) {
    console.error('Batch route calculation error:', error);
    return routes.map(() => null);
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
  truckLocation: Coordinates | null,
  deliveryAddress: string,
  deliveryEndDatetime: string | null
): Promise<{ isLate: boolean; estimatedArrival: Date | null; durationMinutes: number | null }> {
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
        .select(`
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
        `)
        .in('status', ['pending', 'in_transit'])
        .not('truck_id', 'is', null);

      if (ordersError) {
        console.error('⚠️ Error fetching orders:', ordersError);
        return new Response(JSON.stringify({ success: true, results: [], error: 'Failed to fetch orders' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      orders = ordersData || [];
    } catch (ordersException) {
      console.error('⚠️ Exception fetching orders:', ordersException);
      return new Response(JSON.stringify({ success: true, results: [], error: 'Exception fetching orders' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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

    const results: OrderETA[] = [];
    
    // Collect all addresses and routes to batch process
    const addressesToGeocode: string[] = [];
    const ordersToProcess: any[] = [];

    for (const order of orders) {
      try {
        const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
        const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
        
        if (!hasBOL || hasPOD) continue;

        const deliveryStop = order.pickup_drops?.find((stop: any) => stop.type === 'delivery');
        if (!deliveryStop?.address || !order.delivery_end_datetime) continue;

        if (order.delivery_datetime) {
          const deliveryDate = new Date(order.delivery_datetime);
          if (deliveryDate < new Date()) continue;
        }

        const truckNumber = order.trucks?.truck_number;
        if (!truckNumber) continue;

        const truckLocation = truckLocations.find(
          (loc: any) => loc.truck_number === truckNumber
        );
        if (!truckLocation) continue;

        const deliveryAddress = [
          deliveryStop.address,
          deliveryStop.city,
          deliveryStop.state,
          deliveryStop.zip_code,
        ]
          .filter(Boolean)
          .join(', ');

        addressesToGeocode.push(deliveryAddress);
        ordersToProcess.push({
          order,
          truckLocation,
          deliveryAddress,
        });
      } catch (orderError) {
        console.error(`❌ Error preparing order ${order.internal_load_number}:`, orderError);
      }
    }

    console.log(`📦 Batch processing ${ordersToProcess.length} orders`);

    // Batch geocode all delivery addresses
    const geocodedAddresses = await geocodeAddressesBatch(addressesToGeocode);
    
    // Collect routes to calculate
    const routesToCalculate: Array<{ start: Coordinates; end: Coordinates; orderIndex: number }> = [];
    
    ordersToProcess.forEach((item, index) => {
      const deliveryCoords = geocodedAddresses.get(item.deliveryAddress);
      if (deliveryCoords) {
        routesToCalculate.push({
          start: {
            latitude: item.truckLocation.latitude,
            longitude: item.truckLocation.longitude,
          },
          end: deliveryCoords,
          orderIndex: index,
        });
      }
    });

    // Batch calculate all routes
    const routeDurations = await calculateRoutesBatch(
      routesToCalculate.map(r => ({ start: r.start, end: r.end }))
    );

    // Process results
    routesToCalculate.forEach((route, routeIndex) => {
      const durationSeconds = routeDurations[routeIndex];
      const { order, deliveryAddress } = ordersToProcess[route.orderIndex];
      
      if (durationSeconds) {
        const durationMinutes = Math.ceil(durationSeconds / 60);
        const now = new Date();
        const chicagoNow = toZonedTime(now, 'America/Chicago');
        const estimatedArrival = new Date(chicagoNow.getTime() + durationSeconds * 1000);

        const parsed = parseSimpleDateTime(order.delivery_end_datetime);
        const deliveryEndTime = new Date(
          parsed.year,
          parsed.month - 1,
          parsed.day,
          parsed.hours,
          parsed.minutes
        );

        const isLate = estimatedArrival > deliveryEndTime;

        results.push({
          internal_load_number: order.internal_load_number,
          is_late: isLate,
          estimated_arrival: estimatedArrival.toISOString(),
          duration_minutes: durationMinutes,
        });

        console.log(
          `${isLate ? '🔶 LATE' : '✅ ON TIME'}: Order ${order.internal_load_number}`
        );
      }
    });

    console.log(`✅ Processed ${results.length} orders with ETA calculations`);

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

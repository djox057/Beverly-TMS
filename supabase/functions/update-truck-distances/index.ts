import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Terminal coordinates (Lynwood, IL)
const TERMINAL_COORDINATES = { 
  lat: 41.575968, 
  lon: -87.578131 
};

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  location_timestamp: string;
}

interface Coordinates {
  lat: number;
  lon: number;
}

/**
 * Calculate route distance using OSRM
 */
async function calculateRouteDistance(start: Coordinates, end: Coordinates, truckNumber?: string): Promise<number | null> {
  const truckPrefix = truckNumber ? `[Truck ${truckNumber}] ` : '';
  try {
    console.log(`${truckPrefix}📍 Calling OSRM: start(${start.lat},${start.lon}) -> end(${end.lat},${end.lon})`);
    
    const response = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/calculate-route`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ start, end }),
      }
    );

    if (!response.ok) {
      console.error(`${truckPrefix}Route calculation API error:`, response.status);
      return null;
    }

    const data = await response.json();
    return data.success ? data.distance : null;
  } catch (error) {
    console.error(`${truckPrefix}Route calculation error:`, error);
    return null;
  }
}

/**
 * Calculate distance from truck's current location to target using pre-stored coordinates
 */
async function calculateDistanceFromTruck(
  truckLocation: TruckLocation,
  targetCoords: Coordinates | null,
  targetDescription: string
): Promise<number | null> {
  console.log(`📍 CALCULATE DISTANCE - Truck ${truckLocation.truck_number}`);
  console.log(`   🚛 Truck: (${truckLocation.latitude}, ${truckLocation.longitude})`);
  console.log(`   🎯 Target: ${targetDescription}`);

  if (!truckLocation) {
    console.log('❌ Missing truck location');
    return null;
  }

  try {
    // Use terminal coordinates if no target provided
    const endCoords = targetCoords || TERMINAL_COORDINATES;
    console.log(`   📍 End coords: (${endCoords.lat}, ${endCoords.lon})`);

    const truckCoords: Coordinates = {
      lat: truckLocation.latitude,
      lon: truckLocation.longitude,
    };
    
    const distance = await calculateRouteDistance(truckCoords, endCoords, truckLocation.truck_number);
    
    if (distance === null) {
      console.error('❌ OSRM CALCULATION FAILED');
    } else {
      console.log(`   ✅ Distance: ${distance} miles`);
    }
    
    return distance;
  } catch (error) {
    console.error('❌ Error calculating distance:', error);
    return null;
  }
}

/**
 * Calculate distance for an order based on its status using pre-stored coordinates
 */
async function calculateOrderDistance(
  truckLocation: TruckLocation,
  order: any,
  truckStatus?: string
): Promise<number> {
  if (!truckLocation || !order) {
    console.log('⚠️ Missing data:', { hasTruckLocation: !!truckLocation, hasOrder: !!order });
    return 0;
  }

  console.log(`📦 Order: ${order.load_number} | Status: ${order.status} | Truck Status: ${truckStatus}`);

  const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
  const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
  const pickupArrived = order.pickupStop?.arrived_at;

  console.log(`   📄 hasBOL: ${hasBOL}, hasPOD: ${hasPOD}, pickupArrived: ${!!pickupArrived}`);

  // Maintenance - 0 miles
  if (truckStatus === 'Maintenance') {
    console.log('🛑 Truck in maintenance, returning 0 miles');
    return 0;
  }

  // Delivered with POD - 0 miles
  if (hasPOD) {
    console.log('✅ Order delivered (has POD), returning 0 miles');
    return 0;
  }

  // Available - 0 miles
  if (truckStatus === 'Available') {
    console.log('🏭 Status: Available, returning 0 miles');
    return 0;
  }

  // Pending (not picked up and not arrived) - calculate to pickup using stored coords
  if (!pickupArrived && !hasBOL) {
    console.log('📦 Status: Pending - Calculating distance to PICKUP');
    const pickupStop = order.pickupStop;
    
    if (!pickupStop) {
      console.log('❌ No pickup stop found');
      return 0;
    }

    // Use pre-stored coordinates if available
    if (pickupStop.latitude && pickupStop.longitude) {
      const targetCoords: Coordinates = { lat: pickupStop.latitude, lon: pickupStop.longitude };
      const targetDesc = `PICKUP: ${pickupStop.city || ''}, ${pickupStop.state || ''} (stored coords)`;
      const distance = await calculateDistanceFromTruck(truckLocation, targetCoords, targetDesc);
      return distance || 0;
    } else {
      console.log('⚠️ No stored coordinates for pickup, skipping');
      return 0;
    }
  }

  // Picked up (arrived at pickup OR has BOL) but not delivered - calculate to delivery
  if ((pickupArrived || hasBOL) && !hasPOD) {
    console.log('🚛 Status: In Transit - Calculating distance to DELIVERY');
    const deliveryStop = order.deliveryStop;
    
    if (!deliveryStop) {
      console.log('❌ No delivery stop found');
      return 0;
    }

    // Use pre-stored coordinates if available
    if (deliveryStop.latitude && deliveryStop.longitude) {
      const targetCoords: Coordinates = { lat: deliveryStop.latitude, lon: deliveryStop.longitude };
      const targetDesc = `DELIVERY: ${deliveryStop.city || ''}, ${deliveryStop.state || ''} (stored coords)`;
      const distance = await calculateDistanceFromTruck(truckLocation, targetCoords, targetDesc);
      return distance || 0;
    } else {
      console.log('⚠️ No stored coordinates for delivery, skipping');
      return 0;
    }
  }

  console.log('⚠️ No matching condition, returning 0 miles');
  return 0;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Starting truck distances update...');
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch Samsara locations
    console.log('📍 Fetching Samsara locations...');
    const locationsResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/samsara-locations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
      }
    );

    if (!locationsResponse.ok) {
      throw new Error('Failed to fetch Samsara locations');
    }

    const locationsData = await locationsResponse.json();
    const samsaraLocations: TruckLocation[] = locationsData.locations || [];
    console.log(`📍 Found ${samsaraLocations.length} truck locations`);

    // 2. Fetch all trucks with their orders
    console.log('🚛 Fetching trucks with orders...');
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select(`
        id,
        truck_number,
        status,
        orders!orders_truck_id_fkey(
          id,
          load_number,
          status,
          pickup_datetime,
          order_files(id, file_category),
          pickup_drops!inner(
            id,
            type,
            address,
            city,
            state,
            zip_code,
            datetime,
            arrived_at,
            latitude,
            longitude
          )
        )
      `)
      .order('id', { ascending: true });

    if (trucksError) {
      throw trucksError;
    }

    console.log(`🚛 Processing ${trucks?.length || 0} trucks`);

    // 3. Calculate distances for each truck
    let updatedCount = 0;
    
    for (const truck of trucks || []) {
      try {
        const truckLocation = samsaraLocations.find((loc) => loc.truck_number === truck.truck_number);
        
        if (!truckLocation) {
          console.log(`⏭️ Skipping truck ${truck.truck_number}: No location data`);
          continue;
        }

      // ═══════════════════════════════════════════════════════════
      // CURRENT LOAD LOGIC:
      // 1. Priority: Order in active transit (has BOL OR arrived at pickup) AND no POD
      // 2. Fallback: Next upcoming order (earliest pickup date) without POD
      // 3. Result: 0 miles if no current load
      // ═══════════════════════════════════════════════════════════
      
      console.log(`\n🔍 Finding current load for truck ${truck.truck_number}...`);
      
      // Get all non-canceled orders for this truck, sorted by pickup datetime
      const allOrders = (truck.orders || [])
        .filter((order: any) => !order.canceled)
        .sort((a: any, b: any) => {
          const aDate = new Date(a.pickup_datetime || '9999-12-31').getTime();
          const bDate = new Date(b.pickup_datetime || '9999-12-31').getTime();
          return aDate - bDate;
        });
      
      console.log(`📋 Found ${allOrders.length} orders for truck ${truck.truck_number}`);
      
      if (allOrders.length === 0) {
        console.log(`✅ Truck ${truck.truck_number}: No orders, setting to 0 miles`);
      }

      // Current order logic (aligned with Reports page):
      // 1. Default: current = last/latest load that has BOL
      // 2. Exception: if last load has no BOL but previous load has POD, then last load is current
      // 3. Fallback: if no load with BOL, use last load
      let currentOrder = null;
      
      if (allOrders.length > 0) {
        const lastOrder = allOrders[allOrders.length - 1];
        const lastOrderHasBOL = lastOrder.order_files?.some((file: any) => file.file_category === 'BOL');
        
        if (lastOrderHasBOL) {
          // Last load has BOL - it's the current load
          currentOrder = lastOrder;
          console.log(`✅ Current load (LAST WITH BOL): ${currentOrder.load_number}`);
        } else {
          // Last load doesn't have BOL
          if (allOrders.length >= 2) {
            const previousOrder = allOrders[allOrders.length - 2];
            const previousHasPOD = previousOrder.order_files?.some((file: any) => file.file_category === 'POD');
            
            if (previousHasPOD) {
              // Previous load is complete (has POD), so the last load without BOL is current
              currentOrder = lastOrder;
              console.log(`✅ Current load (LAST, PREV HAS POD): ${currentOrder.load_number}`);
            } else {
              // Previous load doesn't have POD, find the last load with BOL
              const lastWithBOL = [...allOrders].reverse().find((order: any) =>
                order.order_files?.some((file: any) => file.file_category === 'BOL')
              );
              currentOrder = lastWithBOL || lastOrder;
              console.log(`✅ Current load (LAST WITH BOL FALLBACK): ${currentOrder.load_number}`);
            }
          } else {
            // Only one order and it doesn't have BOL
            currentOrder = lastOrder;
            console.log(`✅ Current load (SINGLE ORDER): ${currentOrder.load_number}`);
          }
        }
      } else {
        console.log(`ℹ️ Truck ${truck.truck_number}: No current load`);
      }

      let distance = 0;

      if (!currentOrder) {
        // No current order - truck is available, set to 0
        console.log(`📦 Truck ${truck.truck_number}: No active order, setting miles_away to 0`);
        distance = 0;
      } else {
        // Format order with pickup/delivery stops
        const pickupStop = currentOrder.pickup_drops?.find((pd: any) => pd.type === 'pickup');
        const deliveryStop = currentOrder.pickup_drops?.find((pd: any) => pd.type === 'delivery');

        const formattedOrder = {
          ...currentOrder,
          pickupStop,
          deliveryStop,
        };

        // Calculate distance
        distance = await calculateOrderDistance(truckLocation, formattedOrder, truck.status);
      }

        // Update truck record (even if 0)
        const { error: updateError } = await supabase
          .from('trucks')
          .update({ miles_away: distance })
          .eq('id', truck.id);

        if (updateError) {
          console.error(`❌ Error updating truck ${truck.truck_number}:`, updateError);
        } else {
          console.log(`✅ Updated truck ${truck.truck_number}: ${distance} miles`);
          updatedCount++;
        }
      } catch (truckError) {
        console.error(`❌ Error processing truck ${truck.truck_number}:`, truckError);
        // Continue processing other trucks even if one fails
      }
    }

    console.log(`🎉 Successfully updated ${updatedCount} trucks`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Updated ${updatedCount} trucks`,
        processed: trucks?.length || 0,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('❌ Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

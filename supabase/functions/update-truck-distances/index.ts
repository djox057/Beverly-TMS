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
 * Geocode an address using OpenStreetMap Nominatim
 */
async function geocodeAddress(address: string): Promise<Coordinates | null> {
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://nominatim.server4beverly.us/search?format=json&q=${encodedAddress}&limit=5&countrycodes=us`
    );
    
    if (!response.ok) {
      console.error('Geocoding API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.length === 0) {
      console.log('No geocoding results for:', address);
      return null;
    }
    
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Calculate route distance using OSRM
 */
async function calculateRouteDistance(start: Coordinates, end: Coordinates): Promise<number | null> {
  try {
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
      console.error('Route calculation API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.success ? data.distance : null;
  } catch (error) {
    console.error('Route calculation error:', error);
    return null;
  }
}

/**
 * Calculate distance from truck's current location to target
 */
async function calculateDistanceFromTruck(
  truckLocation: TruckLocation,
  targetAddress: string | null = null
): Promise<number | null> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 CALCULATE DISTANCE FROM TRUCK START');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚛 Truck:', truckLocation.truck_number);
  console.log('📍 Truck Location:', {
    lat: truckLocation.latitude,
    lon: truckLocation.longitude
  });
  console.log('🎯 Target:', targetAddress || 'TERMINAL');

  if (!truckLocation) {
    console.log('❌ Missing truck location');
    return null;
  }

  try {
    let targetCoords: Coordinates;
    
    if (!targetAddress) {
      targetCoords = TERMINAL_COORDINATES;
      console.log('📍 Using terminal coordinates:', targetCoords);
    } else {
      console.log('🌐 Geocoding address...');
      targetCoords = await geocodeAddress(targetAddress);
      console.log('🌐 Geocode result:', targetCoords);
      
      if (!targetCoords) {
        console.error('❌ GEOCODING FAILED for:', targetAddress);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        return null;
      }
    }

    const truckCoords: Coordinates = {
      lat: truckLocation.latitude,
      lon: truckLocation.longitude,
    };
    
    console.log('🛣️ Calculating route distance via OSRM...');
    console.log('🛣️ From:', truckCoords);
    console.log('🛣️ To:', targetCoords);
    
    const distance = await calculateRouteDistance(truckCoords, targetCoords);
    
    console.log('🛣️ OSRM Result:', distance, 'miles');
    
    if (distance === null) {
      console.error('❌ OSRM CALCULATION FAILED');
    } else {
      console.log('✅ SUCCESS: Distance =', distance, 'miles');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return distance;
  } catch (error) {
    console.error('❌ Error calculating distance:', error);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    return null;
  }
}

/**
 * Calculate distance for an order based on its status
 */
async function calculateOrderDistance(
  truckLocation: TruckLocation,
  order: any,
  truckStatus?: string
): Promise<number> {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   ORDER DISTANCE CALCULATION START     ║');
  console.log('╚════════════════════════════════════════╝');
  
  if (!truckLocation || !order) {
    console.log('⚠️ Missing data:', { hasTruckLocation: !!truckLocation, hasOrder: !!order });
    return 0;
  }

  console.log('📦 Order:', order.load_number);
  console.log('📦 Status:', order.status);
  console.log('🚛 Truck Status:', truckStatus);

  const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
  const hasPOD = order.order_files?.some((file: any) => file.file_category === 'POD');
  const pickupArrived = order.pickupStop?.arrived_at;

  console.log('📄 Files:', { hasBOL, hasPOD, pickupArrived: !!pickupArrived });

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

  // Available - calculate to next pickup (if exists)
  if (truckStatus === 'Available') {
    console.log('🏭 Status: Available - Looking for next pickup');
    // This truck is available, so we don't calculate distance for this delivered order
    // The parent function will look for the next order
    return 0;
  }

  // Pending (not picked up and not arrived) - calculate to pickup
  if (!pickupArrived && !hasBOL) {
    console.log('📦 Status: Pending (not arrived) - Calculating distance to pickup');
    const pickupStop = order.pickupStop;
    const deliveryStop = order.deliveryStop;
    console.log('📦 VERIFICATION - Pickup stop:', pickupStop);
    console.log('📦 VERIFICATION - Delivery stop (should NOT use this):', deliveryStop);
    
    if (!pickupStop?.address) {
      console.log('❌ No pickup address found');
      return 0;
    }
    
    const fullAddress = `${pickupStop.address}, ${pickupStop.city || ''}, ${pickupStop.state || ''} ${pickupStop.zip_code || ''}`
      .trim()
      .replace(/,\s*,/g, ',')
      .replace(/\s+/g, ' ');
    console.log('📦 Full pickup address being used:', fullAddress);
    console.log('📦 COMPARISON - Delivery address (should NOT match above):', 
      deliveryStop ? `${deliveryStop.address}, ${deliveryStop.city || ''}, ${deliveryStop.state || ''} ${deliveryStop.zip_code || ''}`.trim() : 'N/A');
    
    const distance = await calculateDistanceFromTruck(truckLocation, fullAddress);
    console.log('📦 Pickup distance result:', distance);
    return distance || 0;
  }

  // Picked up (arrived at pickup OR has BOL) but not delivered - calculate to delivery
  if ((pickupArrived || hasBOL) && !hasPOD) {
    console.log('🚛 Status: In Transit (arrived or has BOL) - Calculating distance to delivery');
    const deliveryStop = order.deliveryStop;
    const pickupStop = order.pickupStop;
    console.log('🚛 VERIFICATION - Delivery stop:', deliveryStop);
    console.log('🚛 VERIFICATION - Pickup stop (should NOT use this):', pickupStop);
    
    if (!deliveryStop?.address) {
      console.log('❌ No delivery address found');
      return 0;
    }
    
    const fullAddress = `${deliveryStop.address}, ${deliveryStop.city || ''}, ${deliveryStop.state || ''} ${deliveryStop.zip_code || ''}`
      .trim()
      .replace(/,\s*,/g, ',')
      .replace(/\s+/g, ' ');
    console.log('🚛 Full delivery address being used:', fullAddress);
    console.log('🚛 COMPARISON - Pickup address (should NOT match above):', 
      pickupStop ? `${pickupStop.address}, ${pickupStop.city || ''}, ${pickupStop.state || ''} ${pickupStop.zip_code || ''}`.trim() : 'N/A');
    
    const distance = await calculateDistanceFromTruck(truckLocation, fullAddress);
    console.log('🚛 Delivery distance result:', distance);
    return distance || 0;
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
            arrived_at
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
        const truckLocation = samsaraLocations.find((loc) => loc.truck_id === truck.id);
        
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
      
      // Get all incomplete orders (no POD) for this truck
      const incompleteOrders = truck.orders?.filter((order: any) => 
        !order.order_files?.some((file: any) => file.file_category === 'POD')
      ) || [];
      
      console.log(`📋 Found ${incompleteOrders.length} incomplete orders for truck ${truck.truck_number}`);
      
      if (incompleteOrders.length === 0) {
        console.log(`✅ Truck ${truck.truck_number}: No incomplete orders, setting to 0 miles`);
      }

      // PRIORITY 1: Find orders in active transit (BOL exists OR arrived at pickup)
      const activeTransitOrders = incompleteOrders.filter((order: any) => {
        const hasBOL = order.order_files?.some((file: any) => file.file_category === 'BOL');
        const pickupStop = order.pickup_drops?.find((pd: any) => pd.type === 'pickup');
        const arrivedAtPickup = !!pickupStop?.arrived_at;
        const inTransit = hasBOL || arrivedAtPickup;
        
        if (inTransit) {
          console.log(`🚛 Active transit order found: ${order.load_number} (BOL: ${hasBOL}, Arrived: ${arrivedAtPickup})`);
        }
        
        return inTransit;
      });

      let currentOrder = null;
      
      if (activeTransitOrders.length > 0) {
        // Multiple active orders? Take the earliest one by pickup date
        currentOrder = activeTransitOrders.sort((a: any, b: any) => {
          const aDate = new Date(a.pickup_datetime || '9999-12-31').getTime();
          const bDate = new Date(b.pickup_datetime || '9999-12-31').getTime();
          return aDate - bDate;
        })[0];
        console.log(`✅ Current load (ACTIVE TRANSIT): ${currentOrder.load_number}`);
      } else if (incompleteOrders.length > 0) {
        // PRIORITY 2: No active transit, get next upcoming order (earliest pickup)
        currentOrder = incompleteOrders.sort((a: any, b: any) => {
          const aDate = new Date(a.pickup_datetime || '9999-12-31').getTime();
          const bDate = new Date(b.pickup_datetime || '9999-12-31').getTime();
          return aDate - bDate;
        })[0];
        console.log(`✅ Current load (NEXT ASSIGNMENT): ${currentOrder.load_number}`);
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
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

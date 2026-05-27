import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Terminal coordinates (Lynwood, IL)
const TERMINAL_COORDINATES = { lat: 41.575968, lon: -87.578131 };

const DB_BATCH_SIZE = 10;

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  location_timestamp: string;
  isValid?: boolean;
  ageMinutes?: number;
}

interface Coordinates {
  lat: number;
  lon: number;
}

interface TruckUpdatePayload {
  truckId: string;
  truckNumber: string;
  miles_away: number | null;
  eta_minutes: number | null;
}

// ═══════════════════════════════════════════════════════════
// HAVERSINE DISTANCE (pure math, no external API)
// Returns straight-line distance in miles between two coordinates
// ═══════════════════════════════════════════════════════════
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ═══════════════════════════════════════════════════════════
// CURRENT ORDER LOGIC (unchanged from original)
// Source of truth for order selection — mirrors Reports page logic.
// ═══════════════════════════════════════════════════════════
function findCurrentOrder(orders: any[]): any | null {
  const allOrders = orders
    .filter((order: any) => !order.canceled)
    .sort((a: any, b: any) => {
      const aDate = new Date(a.pickup_datetime || '9999-12-31').getTime();
      const bDate = new Date(b.pickup_datetime || '9999-12-31').getTime();
      return aDate - bDate;
    });

  if (allOrders.length === 0) return null;

  const lastOrder = allOrders[allOrders.length - 1];
  const lastOrderHasBOL = lastOrder.order_files?.some((file: any) => file.file_category === 'BOL');

  if (lastOrderHasBOL) return lastOrder;

  if (allOrders.length >= 2) {
    const previousOrder = allOrders[allOrders.length - 2];
    const previousHasPOD = previousOrder.order_files?.some((file: any) => file.file_category === 'POD');
    if (previousHasPOD) return lastOrder;

    const lastWithBOL = [...allOrders].reverse().find((order: any) =>
      order.order_files?.some((file: any) => file.file_category === 'BOL')
    );
    return lastWithBOL || lastOrder;
  }

  return lastOrder;
}

// ═══════════════════════════════════════════════════════════
// ZERO-MILES CHECK (mirrors calculateOrderDistance logic)
// Returns true if this truck should be set to 0 miles with no API call.
// ═══════════════════════════════════════════════════════════
function isZeroMilesTruck(truckStatus: string | null, currentOrder: any | null): boolean {
  if (!currentOrder) return true;
  const hasPOD = currentOrder.order_files?.some((f: any) => f.file_category === 'POD');
  if (hasPOD) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// Determine destination coordinates for a truck that needs calculation
// ═══════════════════════════════════════════════════════════
function getDestination(currentOrder: any): { coords: Coordinates; desc: string } | null {
  const pickupStop = currentOrder.pickup_drops?.find((pd: any) => pd.type === 'pickup');
  const deliveryStop = currentOrder.pickup_drops?.find((pd: any) => pd.type === 'delivery');

  const hasBOL = currentOrder.order_files?.some((f: any) => f.file_category === 'BOL');
  const pickupArrived = pickupStop?.arrived_at;

  // Pending: calculate to pickup
  if (!pickupArrived && !hasBOL) {
    if (pickupStop?.latitude && pickupStop?.longitude) {
      return {
        coords: { lat: pickupStop.latitude, lon: pickupStop.longitude },
        desc: `PICKUP: ${pickupStop.city || ''}, ${pickupStop.state || ''}`,
      };
    }
    return null;
  }

  // In transit: calculate to delivery
  if ((pickupArrived || hasBOL) && deliveryStop?.latitude && deliveryStop?.longitude) {
    return {
      coords: { lat: deliveryStop.latitude, lon: deliveryStop.longitude },
      desc: `DELIVERY: ${deliveryStop.city || ''}, ${deliveryStop.state || ''}`,
    };
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    console.log('🚀 Starting truck distances update (Haversine × 1.3)...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ── Concurrency guard: session-level advisory lock ──
    const { data: lockAcquired } = await supabase.rpc('try_advisory_lock_truck_distances');
    if (!lockAcquired) {
      console.log('⏭️ Skipping: previous run still in progress');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'concurrent run' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ── Step 1: Fetch Samsara locations ──
    console.log('📍 Step 1: Fetching Samsara locations...');
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
    console.log(`📍 Got ${samsaraLocations.length} truck locations`);

    // Build lookup map for O(1) access — only include FRESH locations.
    // Stale samsara data (isValid=false, e.g. >30 min old) leads to wildly
    // wrong distance calculations vs current order destinations.
    const locationMap = new Map<string, TruckLocation>();
    let staleSkipped = 0;
    for (const loc of samsaraLocations) {
      if (loc.isValid === false) {
        staleSkipped++;
        continue;
      }
      locationMap.set(loc.truck_number, loc);
    }
    console.log(`📍 ${locationMap.size} fresh locations usable, ${staleSkipped} stale skipped`);

    // ── Step 2: Fetch trucks with orders ──
    console.log('🚛 Step 2: Fetching trucks with orders...');
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
          canceled,
          order_files(id, file_category),
          pickup_drops(
            id,
            type,
            city,
            state,
            arrived_at,
            latitude,
            longitude
          )
        )
      `)
      .eq('orders.locked', false)
      .order('id', { ascending: true });

    if (trucksError) throw trucksError;
    console.log(`🚛 Got ${trucks?.length || 0} trucks`);

    // ── Step 3: Classify trucks and compute distances in one pass ──
    console.log('🧮 Step 3: Computing Haversine distances...');
    const allUpdates: TruckUpdatePayload[] = [];
    let skippedNoLocation = 0;
    let skippedNoDestCoords = 0;
    let zeroMilesCount = 0;
    let calculatedCount = 0;

    for (const truck of trucks || []) {
      const truckLocation = locationMap.get(truck.truck_number);
      if (!truckLocation) {
        skippedNoLocation++;
        // No fresh location → null out miles_away so UI hides it instead of
        // showing a value computed against outdated GPS coords.
        allUpdates.push({
          truckId: truck.id,
          truckNumber: truck.truck_number,
          miles_away: null,
          eta_minutes: null,
        });
        continue;
      }

      const currentOrder = findCurrentOrder(truck.orders || []);

      if (isZeroMilesTruck(truck.status, currentOrder)) {
        allUpdates.push({
          truckId: truck.id,
          truckNumber: truck.truck_number,
          miles_away: 0,
          eta_minutes: null,
        });
        zeroMilesCount++;
        continue;
      }

      // Determine destination
      const dest = getDestination(currentOrder);
      if (!dest) {
        skippedNoDestCoords++;
        allUpdates.push({
          truckId: truck.id,
          truckNumber: truck.truck_number,
          miles_away: null,
          eta_minutes: null,
        });
        continue;
      }

      // Haversine × 1.3 road correction
      const straightLine = haversineDistance(
        truckLocation.latitude, truckLocation.longitude,
        dest.coords.lat, dest.coords.lon
      );
      const roadMiles = Math.round(straightLine * 1.3);
      const etaMinutes = Math.round(roadMiles / 45 * 60); // 45 mph average

      allUpdates.push({
        truckId: truck.id,
        truckNumber: truck.truck_number,
        miles_away: roadMiles,
        eta_minutes: etaMinutes,
      });
      calculatedCount++;
      console.log(`✅ ${truck.truck_number}: ${roadMiles} mi (${etaMinutes} min) → ${dest.desc}`);
    }

    console.log(`🧮 Classification: ${zeroMilesCount} zero-miles, ${calculatedCount} calculated, ${skippedNoLocation} no location, ${skippedNoDestCoords} no dest coords`);

    // ── Step 4: Batch DB updates ──
    console.log(`💾 Step 4: Updating ${allUpdates.length} trucks in DB (batches of ${DB_BATCH_SIZE})...`);
    let dbUpdated = 0;
    let dbFailed = 0;

    for (let i = 0; i < allUpdates.length; i += DB_BATCH_SIZE) {
      const batch = allUpdates.slice(i, i + DB_BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (update) => {
          const { error } = await supabase
            .from('trucks')
            .update({ miles_away: update.miles_away, eta_minutes: update.eta_minutes })
            .eq('id', update.truckId);
          return { truckNumber: update.truckNumber, error };
        })
      );

      for (const { truckNumber, error } of results) {
        if (error) {
          dbFailed++;
          console.error(`❌ DB update failed for ${truckNumber}:`, error);
        } else {
          dbUpdated++;
        }
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🏁 Done in ${duration}ms — Updated: ${dbUpdated}, DB errors: ${dbFailed}`);

    // Release session-level advisory lock
    await supabase.rpc('advisory_unlock_truck_distances');

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        trucks_total: trucks?.length || 0,
        trucks_updated: dbUpdated,
        trucks_zero_miles: zeroMilesCount,
        trucks_calculated: calculatedCount,
        trucks_db_failed: dbFailed,
        trucks_no_location: skippedNoLocation,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Fatal error after ${duration}ms:`, error);

    // Release session-level advisory lock even on error
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase.rpc('advisory_unlock_truck_distances');
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

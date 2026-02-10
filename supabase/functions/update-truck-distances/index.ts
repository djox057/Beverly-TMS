import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Terminal coordinates (Lynwood, IL)
const TERMINAL_COORDINATES = { lat: 41.575968, lon: -87.578131 };

const OSRM_BATCH_SIZE = 5;
const DB_BATCH_SIZE = 10;
const OSRM_RETRY_COUNT = 2;
const OSRM_RETRY_DELAYS = [500, 1000]; // ms

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

interface RouteResult {
  distance: number | null;
  duration: number | null;
}

interface TruckCalcEntry {
  truckId: string;
  truckNumber: string;
  start: Coordinates;
  end: Coordinates;
  targetDesc: string;
}

interface TruckUpdatePayload {
  truckId: string;
  truckNumber: string;
  miles_away: number;
  eta_minutes: number | null;
}

// ═══════════════════════════════════════════════════════════
// OSRM: Direct call with retry + exponential backoff
// On failure after retries, returns null (preserves previous DB value)
// ═══════════════════════════════════════════════════════════
async function callOSRM(start: Coordinates, end: Coordinates, truckNumber: string): Promise<RouteResult> {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=false&alternatives=false&steps=false`;

  for (let attempt = 0; attempt <= OSRM_RETRY_COUNT; attempt++) {
    try {
      if (attempt > 0) {
        const delay = OSRM_RETRY_DELAYS[attempt - 1] || 1000;
        console.log(`[${truckNumber}] ⏳ Retry ${attempt}/${OSRM_RETRY_COUNT} after ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      }

      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[${truckNumber}] OSRM HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (data.code === 'Ok' && data.routes?.[0]) {
        const distanceMiles = Math.round(data.routes[0].distance / 1609.344);
        const durationSec = data.routes[0].duration;
        return { distance: distanceMiles, duration: durationSec };
      }
      console.error(`[${truckNumber}] OSRM no route: ${data.code}`);
      return { distance: null, duration: null }; // no route exists, don't retry
    } catch (error) {
      console.error(`[${truckNumber}] OSRM error (attempt ${attempt + 1}):`, error);
    }
  }

  console.error(`[${truckNumber}] OSRM failed after ${OSRM_RETRY_COUNT + 1} attempts — preserving previous value`);
  return { distance: null, duration: null };
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
  if (truckStatus === 'Maintenance' || truckStatus === 'Available') return true;
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
    console.log('🚀 Starting optimized truck distances update...');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

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

    // Build lookup map for O(1) access
    const locationMap = new Map<string, TruckLocation>();
    for (const loc of samsaraLocations) {
      locationMap.set(loc.truck_number, loc);
    }

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

    if (trucksError) throw trucksError;
    console.log(`🚛 Got ${trucks?.length || 0} trucks`);

    // ── Step 3: Pure logic pass — classify all trucks ──
    console.log('🧠 Step 3: Classifying trucks...');
    const zeroMilesUpdates: TruckUpdatePayload[] = [];
    const needsCalculation: TruckCalcEntry[] = [];
    let skippedNoLocation = 0;
    let skippedNoDestCoords = 0;

    for (const truck of trucks || []) {
      const truckLocation = locationMap.get(truck.truck_number);
      if (!truckLocation) {
        skippedNoLocation++;
        continue;
      }

      const currentOrder = findCurrentOrder(truck.orders || []);

      if (isZeroMilesTruck(truck.status, currentOrder)) {
        zeroMilesUpdates.push({
          truckId: truck.id,
          truckNumber: truck.truck_number,
          miles_away: 0,
          eta_minutes: null,
        });
        continue;
      }

      // Determine destination
      const dest = getDestination(currentOrder);
      if (!dest) {
        skippedNoDestCoords++;
        zeroMilesUpdates.push({
          truckId: truck.id,
          truckNumber: truck.truck_number,
          miles_away: 0,
          eta_minutes: null,
        });
        continue;
      }

      needsCalculation.push({
        truckId: truck.id,
        truckNumber: truck.truck_number,
        start: { lat: truckLocation.latitude, lon: truckLocation.longitude },
        end: dest.coords,
        targetDesc: dest.desc,
      });
    }

    console.log(`🧠 Classification: ${zeroMilesUpdates.length} zero-miles, ${needsCalculation.length} need OSRM, ${skippedNoLocation} no location, ${skippedNoDestCoords} no dest coords`);

    // ── Step 4: Parallel batched OSRM calls ──
    console.log(`🌐 Step 4: Calling OSRM for ${needsCalculation.length} trucks (batches of ${OSRM_BATCH_SIZE})...`);
    const calculatedUpdates: TruckUpdatePayload[] = [];
    let osrmFailed = 0;

    for (let i = 0; i < needsCalculation.length; i += OSRM_BATCH_SIZE) {
      const batch = needsCalculation.slice(i, i + OSRM_BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (entry) => {
          const result = await callOSRM(entry.start, entry.end, entry.truckNumber);
          return { entry, result };
        })
      );

      for (const { entry, result } of results) {
        if (result.distance !== null) {
          const etaMinutes = result.duration ? Math.round(result.duration / 60) : null;
          calculatedUpdates.push({
            truckId: entry.truckId,
            truckNumber: entry.truckNumber,
            miles_away: result.distance,
            eta_minutes: etaMinutes,
          });
          console.log(`✅ ${entry.truckNumber}: ${result.distance} mi → ${entry.targetDesc}`);
        } else {
          // Preserve previous value — do NOT add to updates
          osrmFailed++;
          console.log(`⚠️ ${entry.truckNumber}: OSRM failed, preserving previous value`);
        }
      }

      // Small delay between batches to be polite to OSRM
      if (i + OSRM_BATCH_SIZE < needsCalculation.length) {
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`🌐 OSRM complete: ${calculatedUpdates.length} calculated, ${osrmFailed} failed (preserved)`);

    // ── Step 5: Batch DB updates ──
    const allUpdates = [...zeroMilesUpdates, ...calculatedUpdates];
    console.log(`💾 Step 5: Updating ${allUpdates.length} trucks in DB (batches of ${DB_BATCH_SIZE})...`);
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
    console.log(`🏁 Done in ${duration}ms — Updated: ${dbUpdated}, DB errors: ${dbFailed}, OSRM skipped: ${osrmFailed}`);

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        trucks_total: trucks?.length || 0,
        trucks_updated: dbUpdated,
        trucks_zero_miles: zeroMilesUpdates.length,
        trucks_calculated: calculatedUpdates.length,
        trucks_osrm_failed: osrmFailed,
        trucks_db_failed: dbFailed,
        trucks_no_location: skippedNoLocation,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Fatal error after ${duration}ms:`, error);
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

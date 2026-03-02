import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { fetchSamsaraLocations } from "../_shared/samsara.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Terminal coordinates (Lynwood, IL)
const TERMINAL_COORDINATES = { lat: 41.575968, lon: -87.578131 };

const CHUNK_SIZE = 200;

interface TruckLocation {
  truck_id: string;
  truck_number: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

interface Coordinates {
  lat: number;
  lon: number;
}

interface TruckUpdatePayload {
  truckId: string;
  truckNumber: string;
  miles_away: number;
  eta_minutes: number | null;
}

// ═══════════════════════════════════════════════════════════
// HAVERSINE DISTANCE (pure math, no external API)
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
// CURRENT ORDER LOGIC
// ═══════════════════════════════════════════════════════════
function findCurrentOrder(orders: any[], orderFilesMap: Map<string, any[]>): any | null {
  const allOrders = orders
    .filter((order: any) => !order.canceled)
    .sort((a: any, b: any) => {
      const aDate = new Date(a.pickup_datetime || '9999-12-31').getTime();
      const bDate = new Date(b.pickup_datetime || '9999-12-31').getTime();
      return aDate - bDate;
    });

  if (allOrders.length === 0) return null;

  const lastOrder = allOrders[allOrders.length - 1];
  const lastOrderFiles = orderFilesMap.get(lastOrder.id) || [];
  const lastOrderHasBOL = lastOrderFiles.some((file: any) => file.file_category === 'BOL');

  if (lastOrderHasBOL) return lastOrder;

  if (allOrders.length >= 2) {
    const previousOrder = allOrders[allOrders.length - 2];
    const previousFiles = orderFilesMap.get(previousOrder.id) || [];
    const previousHasPOD = previousFiles.some((file: any) => file.file_category === 'POD');
    if (previousHasPOD) return lastOrder;

    const lastWithBOL = [...allOrders].reverse().find((order: any) => {
      const files = orderFilesMap.get(order.id) || [];
      return files.some((file: any) => file.file_category === 'BOL');
    });
    return lastWithBOL || lastOrder;
  }

  return lastOrder;
}

// ═══════════════════════════════════════════════════════════
// ZERO-MILES CHECK
// ═══════════════════════════════════════════════════════════
function isZeroMilesTruck(truckStatus: string | null, currentOrder: any | null, orderFilesMap: Map<string, any[]>): boolean {
  if (!currentOrder) return true;
  if (truckStatus === 'Maintenance' || truckStatus === 'Available') return true;
  const files = orderFilesMap.get(currentOrder.id) || [];
  const hasPOD = files.some((f: any) => f.file_category === 'POD');
  if (hasPOD) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════
// Determine destination coordinates
// ═══════════════════════════════════════════════════════════
function getDestination(currentOrder: any, pickupDropsMap: Map<string, any[]>, orderFilesMap: Map<string, any[]>): { coords: Coordinates; desc: string } | null {
  const drops = pickupDropsMap.get(currentOrder.id) || [];
  const pickupStop = drops.find((pd: any) => pd.type === 'pickup');
  const deliveryStop = drops.find((pd: any) => pd.type === 'delivery');

  const files = orderFilesMap.get(currentOrder.id) || [];
  const hasBOL = files.some((f: any) => f.file_category === 'BOL');
  const pickupArrived = pickupStop?.arrived_at;

  if (!pickupArrived && !hasBOL) {
    if (pickupStop?.latitude && pickupStop?.longitude) {
      return {
        coords: { lat: pickupStop.latitude, lon: pickupStop.longitude },
        desc: `PICKUP: ${pickupStop.city || ''}, ${pickupStop.state || ''}`,
      };
    }
    return null;
  }

  if ((pickupArrived || hasBOL) && deliveryStop?.latitude && deliveryStop?.longitude) {
    return {
      coords: { lat: deliveryStop.latitude, lon: deliveryStop.longitude },
      desc: `DELIVERY: ${deliveryStop.city || ''}, ${deliveryStop.state || ''}`,
    };
  }

  return null;
}

/** Chunk an array of IDs and fetch in parallel batches */
async function chunkedIn<T>(
  supabase: any,
  table: string,
  column: string,
  ids: string[],
  selectCols: string,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await supabase
        .from(table)
        .select(selectCols)
        .in(column, chunk);
      if (error) {
        console.error(`Error fetching ${table}:`, error);
        return [];
      }
      return data || [];
    }),
  );
  return results.flat();
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

    // ── Step 1: Fetch Samsara locations (direct import, no HTTP round-trip) ──
    console.log('📍 Step 1: Fetching Samsara locations...');
    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1') ?? '';
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2') ?? '';
    const { locations: samsaraLocations } = await fetchSamsaraLocations(
      supabase,
      [apiKey1, apiKey2].filter(Boolean),
    );
    console.log(`📍 Got ${samsaraLocations.length} truck locations`);

    // Build lookup map for O(1) access
    const locationMap = new Map<string, TruckLocation>();
    for (const loc of samsaraLocations) {
      locationMap.set(loc.truck_number, loc);
    }

    // ── Step 2: Flat batch-fetch trucks + orders + files + drops ──
    console.log('🚛 Step 2: Fetching trucks (flat batch pattern)...');

    // Stage 1: Flat trucks
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select('id, truck_number, status')
      .not('driver1_id', 'is', null)
      .order('id', { ascending: true });

    if (trucksError) throw trucksError;
    console.log(`🚛 Got ${trucks?.length || 0} trucks with drivers`);

    const truckIds = (trucks || []).map((t: any) => t.id);

    // Stage 2: Flat unlocked orders for those trucks
    const orders = await chunkedIn<any>(
      supabase,
      'orders',
      'truck_id',
      truckIds,
      'id, truck_id, load_number, status, pickup_datetime, canceled',
    );
    // Filter unlocked orders client-side (the index idx_orders_truck_locked covers this)
    // We fetch with .eq('locked', false) per chunk
    const unlockedOrders = orders; // chunkedIn doesn't support .eq chaining, so let's do it properly
    
    // Re-fetch with locked=false filter
    const fetchUnlockedOrders = async (tIds: string[]): Promise<any[]> => {
      if (tIds.length === 0) return [];
      const chunks: string[][] = [];
      for (let i = 0; i < tIds.length; i += CHUNK_SIZE) {
        chunks.push(tIds.slice(i, i + CHUNK_SIZE));
      }
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await supabase
            .from('orders')
            .select('id, truck_id, load_number, status, pickup_datetime, canceled')
            .in('truck_id', chunk)
            .eq('locked', false);
          if (error) {
            console.error('Error fetching orders:', error);
            return [];
          }
          return data || [];
        }),
      );
      return results.flat();
    };

    const allOrders = await fetchUnlockedOrders(truckIds);
    const orderIds = allOrders.map((o: any) => o.id);
    console.log(`📋 Got ${allOrders.length} unlocked orders`);

    // Stage 3: Parallel batch fetch order_files and pickup_drops
    const [allOrderFiles, allPickupDrops] = await Promise.all([
      chunkedIn<any>(supabase, 'order_files', 'order_id', orderIds, 'id, order_id, file_category'),
      chunkedIn<any>(supabase, 'pickup_drops', 'order_id', orderIds, 'id, order_id, type, city, state, arrived_at, latitude, longitude'),
    ]);

    // Build lookup maps
    const ordersByTruck = new Map<string, any[]>();
    for (const o of allOrders) {
      const arr = ordersByTruck.get(o.truck_id) || [];
      arr.push(o);
      ordersByTruck.set(o.truck_id, arr);
    }

    const orderFilesMap = new Map<string, any[]>();
    for (const f of allOrderFiles) {
      const arr = orderFilesMap.get(f.order_id) || [];
      arr.push(f);
      orderFilesMap.set(f.order_id, arr);
    }

    const pickupDropsMap = new Map<string, any[]>();
    for (const pd of allPickupDrops) {
      const arr = pickupDropsMap.get(pd.order_id) || [];
      arr.push(pd);
      pickupDropsMap.set(pd.order_id, arr);
    }

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
        continue;
      }

      const truckOrders = ordersByTruck.get(truck.id) || [];
      const currentOrder = findCurrentOrder(truckOrders, orderFilesMap);

      if (isZeroMilesTruck(truck.status, currentOrder, orderFilesMap)) {
        allUpdates.push({
          truckId: truck.id,
          truckNumber: truck.truck_number,
          miles_away: 0,
          eta_minutes: null,
        });
        zeroMilesCount++;
        continue;
      }

      const dest = getDestination(currentOrder, pickupDropsMap, orderFilesMap);
      if (!dest) {
        skippedNoDestCoords++;
        allUpdates.push({
          truckId: truck.id,
          truckNumber: truck.truck_number,
          miles_away: 0,
          eta_minutes: null,
        });
        zeroMilesCount++;
        continue;
      }

      // Haversine × 1.3 road correction
      const straightLine = haversineDistance(
        truckLocation.latitude, truckLocation.longitude,
        dest.coords.lat, dest.coords.lon
      );
      const roadMiles = Math.round(straightLine * 1.3);
      const etaMinutes = Math.round(roadMiles / 45 * 60);

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

    // ── Step 4: Single bulk RPC update ──
    console.log(`💾 Step 4: Bulk updating ${allUpdates.length} trucks via RPC...`);
    if (allUpdates.length > 0) {
      const { error: rpcError } = await supabase.rpc('bulk_update_truck_distances', {
        updates: JSON.stringify(allUpdates.map(u => ({
          id: u.truckId,
          miles_away: u.miles_away,
          eta_minutes: u.eta_minutes,
        }))),
      });

      if (rpcError) {
        console.error('❌ Bulk RPC update failed:', rpcError);
      } else {
        console.log(`✅ Bulk updated ${allUpdates.length} trucks`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🏁 Done in ${duration}ms — Updated: ${allUpdates.length}`);

    // Release session-level advisory lock
    await supabase.rpc('advisory_unlock_truck_distances');

    return new Response(
      JSON.stringify({
        success: true,
        duration_ms: duration,
        trucks_total: trucks?.length || 0,
        trucks_updated: allUpdates.length,
        trucks_zero_miles: zeroMilesCount,
        trucks_calculated: calculatedCount,
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

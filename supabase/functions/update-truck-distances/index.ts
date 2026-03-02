import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

// Haversine distance in miles
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

function isZeroMilesTruck(truckStatus: string | null, currentOrder: any | null, orderFilesMap: Map<string, any[]>): boolean {
  if (!currentOrder) return true;
  if (truckStatus === 'Maintenance' || truckStatus === 'Available') return true;
  const files = orderFilesMap.get(currentOrder.id) || [];
  const hasPOD = files.some((f: any) => f.file_category === 'POD');
  if (hasPOD) return true;
  return false;
}

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
  extraFilter?: (q: any) => any,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    chunks.push(ids.slice(i, i + CHUNK_SIZE));
  }
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      let q = supabase.from(table).select(selectCols).in(column, chunk);
      if (extraFilter) q = extraFilter(q);
      const { data, error } = await q;
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

    // ── Concurrency guard ──
    const { data: lockAcquired } = await supabase.rpc('try_advisory_lock_truck_distances');
    if (!lockAcquired) {
      console.log('⏭️ Skipping: previous run still in progress');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'concurrent run' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ── Step 1: Read locations from cache (NO Samsara API call) ──
    console.log('📍 Step 1: Reading cached Samsara locations...');
    const { data: cacheRow } = await supabase
      .from('samsara_locations_cache')
      .select('locations, fetched_at')
      .eq('id', 'latest')
      .maybeSingle();

    const samsaraLocations: TruckLocation[] = (cacheRow?.locations as TruckLocation[]) || [];
    const cacheAge = cacheRow?.fetched_at
      ? Math.round((Date.now() - new Date(cacheRow.fetched_at).getTime()) / 1000)
      : -1;
    console.log(`📍 Got ${samsaraLocations.length} cached locations (${cacheAge}s old)`);

    if (samsaraLocations.length === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'no cached locations' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Build lookup map
    const locationMap = new Map<string, TruckLocation>();
    for (const loc of samsaraLocations) {
      locationMap.set(loc.truck_number, loc);
    }

    // ── Step 2: Fetch trucks with drivers ──
    console.log('🚛 Step 2: Fetching trucks...');
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select('id, truck_number, status')
      .not('driver1_id', 'is', null);

    if (trucksError) throw trucksError;
    console.log(`🚛 Got ${trucks?.length || 0} trucks with drivers`);

    const truckIds = (trucks || []).map((t: any) => t.id);

    // ── Step 3: Fetch unlocked orders + related data ──
    const allOrders = await chunkedIn<any>(
      supabase, 'orders', 'truck_id', truckIds,
      'id, truck_id, load_number, status, pickup_datetime, canceled',
      (q: any) => q.eq('locked', false),
    );
    const orderIds = allOrders.map((o: any) => o.id);
    console.log(`📋 Got ${allOrders.length} unlocked orders`);

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

    // ── Step 4: Compute distances ──
    console.log('🧮 Step 4: Computing Haversine distances...');
    const allUpdates: TruckUpdatePayload[] = [];
    let zeroMilesCount = 0;
    let calculatedCount = 0;
    let skippedNoLocation = 0;

    for (const truck of trucks || []) {
      const truckLocation = locationMap.get(truck.truck_number);
      if (!truckLocation) { skippedNoLocation++; continue; }

      const truckOrders = ordersByTruck.get(truck.id) || [];
      const currentOrder = findCurrentOrder(truckOrders, orderFilesMap);

      if (isZeroMilesTruck(truck.status, currentOrder, orderFilesMap)) {
        allUpdates.push({ truckId: truck.id, truckNumber: truck.truck_number, miles_away: 0, eta_minutes: null });
        zeroMilesCount++;
        continue;
      }

      const dest = getDestination(currentOrder, pickupDropsMap, orderFilesMap);
      if (!dest) {
        allUpdates.push({ truckId: truck.id, truckNumber: truck.truck_number, miles_away: 0, eta_minutes: null });
        zeroMilesCount++;
        continue;
      }

      const straightLine = haversineDistance(truckLocation.latitude, truckLocation.longitude, dest.coords.lat, dest.coords.lon);
      const roadMiles = Math.round(straightLine * 1.3);
      const etaMinutes = Math.round(roadMiles / 45 * 60);

      allUpdates.push({ truckId: truck.id, truckNumber: truck.truck_number, miles_away: roadMiles, eta_minutes: etaMinutes });
      calculatedCount++;
    }

    console.log(`🧮 ${zeroMilesCount} zero, ${calculatedCount} calculated, ${skippedNoLocation} no location`);

    // ── Step 5: Bulk update ──
    if (allUpdates.length > 0) {
      const { error: rpcError } = await supabase.rpc('bulk_update_truck_distances', {
        updates: JSON.stringify(allUpdates.map(u => ({
          id: u.truckId,
          miles_away: u.miles_away,
          eta_minutes: u.eta_minutes,
        }))),
      });
      if (rpcError) console.error('❌ Bulk RPC failed:', rpcError);
      else console.log(`✅ Bulk updated ${allUpdates.length} trucks`);
    }

    const duration = Date.now() - startTime;
    console.log(`🏁 Done in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true, duration_ms: duration,
        trucks_total: trucks?.length || 0, trucks_updated: allUpdates.length,
        trucks_zero_miles: zeroMilesCount, trucks_calculated: calculatedCount,
        cache_age_seconds: cacheAge,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Fatal error after ${duration}ms:`, error);

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error', duration_ms: duration }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

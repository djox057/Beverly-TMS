import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Terminal coordinates (Lynwood, IL)
const TERMINAL_COORDINATES = { lat: 41.575968, lon: -87.578131 };

const DB_BATCH_SIZE = 10;

// Continental US bounds (loose). Used to reject mis-geocoded destinations
// (e.g. "Cartersville, GA" resolving to Alaska) that would otherwise produce
// nonsense 4000+ "miles away" values.
const US_BOUNDS = { minLat: 24.0, maxLat: 50.0, minLon: -125.5, maxLon: -65.0 };

// Approximate per-state bounds. Missing entries fall back to US-only check.
const STATE_BOUNDS: Record<string, { minLat: number; maxLat: number; minLon: number; maxLon: number }> = {
  AL: { minLat: 30.1, maxLat: 35.1, minLon: -88.6, maxLon: -84.8 },
  AR: { minLat: 33.0, maxLat: 36.6, minLon: -94.7, maxLon: -89.6 },
  AZ: { minLat: 31.3, maxLat: 37.1, minLon: -114.9, maxLon: -109.0 },
  CA: { minLat: 32.4, maxLat: 42.1, minLon: -124.6, maxLon: -114.0 },
  CO: { minLat: 36.9, maxLat: 41.1, minLon: -109.1, maxLon: -102.0 },
  CT: { minLat: 40.9, maxLat: 42.1, minLon: -73.8, maxLon: -71.7 },
  DC: { minLat: 38.7, maxLat: 39.1, minLon: -77.2, maxLon: -76.9 },
  DE: { minLat: 38.4, maxLat: 39.9, minLon: -75.8, maxLon: -74.9 },
  FL: { minLat: 24.4, maxLat: 31.1, minLon: -87.7, maxLon: -79.9 },
  GA: { minLat: 30.3, maxLat: 35.1, minLon: -85.7, maxLon: -80.7 },
  IA: { minLat: 40.3, maxLat: 43.6, minLon: -96.7, maxLon: -90.1 },
  ID: { minLat: 41.9, maxLat: 49.1, minLon: -117.3, maxLon: -110.9 },
  IL: { minLat: 36.9, maxLat: 42.6, minLon: -91.6, maxLon: -87.4 },
  IN: { minLat: 37.7, maxLat: 41.9, minLon: -88.2, maxLon: -84.7 },
  KS: { minLat: 36.9, maxLat: 40.1, minLon: -102.1, maxLon: -94.5 },
  KY: { minLat: 36.4, maxLat: 39.2, minLon: -89.7, maxLon: -81.8 },
  LA: { minLat: 28.8, maxLat: 33.1, minLon: -94.1, maxLon: -88.7 },
  MA: { minLat: 41.1, maxLat: 42.9, minLon: -73.6, maxLon: -69.8 },
  MD: { minLat: 37.8, maxLat: 39.8, minLon: -79.6, maxLon: -75.0 },
  ME: { minLat: 42.9, maxLat: 47.6, minLon: -71.1, maxLon: -66.8 },
  MI: { minLat: 41.6, maxLat: 48.4, minLon: -90.5, maxLon: -82.3 },
  MN: { minLat: 43.4, maxLat: 49.5, minLon: -97.3, maxLon: -89.4 },
  MO: { minLat: 35.9, maxLat: 40.7, minLon: -95.9, maxLon: -89.0 },
  MS: { minLat: 30.1, maxLat: 35.1, minLon: -91.7, maxLon: -88.0 },
  MT: { minLat: 44.3, maxLat: 49.1, minLon: -116.1, maxLon: -103.9 },
  NC: { minLat: 33.7, maxLat: 36.7, minLon: -84.4, maxLon: -75.3 },
  ND: { minLat: 45.8, maxLat: 49.1, minLon: -104.1, maxLon: -96.5 },
  NE: { minLat: 39.9, maxLat: 43.1, minLon: -104.1, maxLon: -95.2 },
  NH: { minLat: 42.6, maxLat: 45.4, minLon: -72.6, maxLon: -70.5 },
  NJ: { minLat: 38.8, maxLat: 41.4, minLon: -75.6, maxLon: -73.8 },
  NM: { minLat: 31.2, maxLat: 37.1, minLon: -109.1, maxLon: -103.0 },
  NV: { minLat: 34.9, maxLat: 42.1, minLon: -120.1, maxLon: -114.0 },
  NY: { minLat: 40.4, maxLat: 45.1, minLon: -79.9, maxLon: -71.8 },
  OH: { minLat: 38.3, maxLat: 42.4, minLon: -84.9, maxLon: -80.4 },
  OK: { minLat: 33.5, maxLat: 37.1, minLon: -103.1, maxLon: -94.4 },
  OR: { minLat: 41.9, maxLat: 46.4, minLon: -124.7, maxLon: -116.4 },
  PA: { minLat: 39.6, maxLat: 42.4, minLon: -80.6, maxLon: -74.6 },
  RI: { minLat: 41.1, maxLat: 42.1, minLon: -71.9, maxLon: -71.0 },
  SC: { minLat: 31.9, maxLat: 35.3, minLon: -83.5, maxLon: -78.4 },
  SD: { minLat: 42.4, maxLat: 46.0, minLon: -104.1, maxLon: -96.4 },
  TN: { minLat: 34.8, maxLat: 36.8, minLon: -90.4, maxLon: -81.5 },
  TX: { minLat: 25.7, maxLat: 36.6, minLon: -106.7, maxLon: -93.4 },
  UT: { minLat: 36.9, maxLat: 42.1, minLon: -114.1, maxLon: -108.9 },
  VA: { minLat: 36.5, maxLat: 39.6, minLon: -83.7, maxLon: -75.1 },
  VT: { minLat: 42.6, maxLat: 45.1, minLon: -73.5, maxLon: -71.4 },
  WA: { minLat: 45.4, maxLat: 49.1, minLon: -124.8, maxLon: -116.8 },
  WI: { minLat: 42.4, maxLat: 47.4, minLon: -93.0, maxLon: -86.7 },
  WV: { minLat: 37.1, maxLat: 40.7, minLon: -82.7, maxLon: -77.6 },
  WY: { minLat: 40.9, maxLat: 45.1, minLon: -111.1, maxLon: -104.0 },
};

function isValidStopCoord(lat: number, lon: number, state?: string | null): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  if (lat < US_BOUNDS.minLat || lat > US_BOUNDS.maxLat || lon < US_BOUNDS.minLon || lon > US_BOUNDS.maxLon) {
    return false;
  }
  if (state) {
    const b = STATE_BOUNDS[state.toUpperCase()];
    if (b && (lat < b.minLat || lat > b.maxLat || lon < b.minLon || lon > b.maxLon)) {
      return false;
    }
  }
  return true;
}

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
    if (
      pickupStop?.latitude &&
      pickupStop?.longitude &&
      isValidStopCoord(pickupStop.latitude, pickupStop.longitude, pickupStop.state)
    ) {
      return {
        coords: { lat: pickupStop.latitude, lon: pickupStop.longitude },
        desc: `PICKUP: ${pickupStop.city || ''}, ${pickupStop.state || ''}`,
      };
    }
    if (pickupStop?.latitude && pickupStop?.longitude) {
      console.warn(
        `⚠️ Rejected pickup coords (out of state/US bounds) ${pickupStop.city || ''}, ${pickupStop.state || ''}: ${pickupStop.latitude}, ${pickupStop.longitude}`,
      );
    }
    return null;
  }

  // In transit: calculate to delivery
  if (
    (pickupArrived || hasBOL) &&
    deliveryStop?.latitude &&
    deliveryStop?.longitude &&
    isValidStopCoord(deliveryStop.latitude, deliveryStop.longitude, deliveryStop.state)
  ) {
    return {
      coords: { lat: deliveryStop.latitude, lon: deliveryStop.longitude },
      desc: `DELIVERY: ${deliveryStop.city || ''}, ${deliveryStop.state || ''}`,
    };
  }
  if ((pickupArrived || hasBOL) && deliveryStop?.latitude && deliveryStop?.longitude) {
    console.warn(
      `⚠️ Rejected delivery coords (out of state/US bounds) ${deliveryStop.city || ''}, ${deliveryStop.state || ''}: ${deliveryStop.latitude}, ${deliveryStop.longitude}`,
    );
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
        miles_away,
        eta_minutes,
        miles_away_updated_at,
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
    let preservedStale = 0;

    const STALE_PRESERVE_MS = 24 * 60 * 60 * 1000; // keep last value up to 24h
    const now = Date.now();

    for (const truck of trucks || []) {
      const truckLocation = locationMap.get(truck.truck_number);
      if (!truckLocation) {
        skippedNoLocation++;
        // No fresh GPS. If we have a recent (<24h) miles_away value, leave it
        // alone so dispatchers keep seeing the last known distance. Only clear
        // out if the cached value is missing or older than 24h.
        const lastUpdatedRaw = (truck as any).miles_away_updated_at;
        const lastUpdatedMs = lastUpdatedRaw ? new Date(lastUpdatedRaw).getTime() : 0;
        const hasRecentValue =
          (truck as any).miles_away !== null &&
          lastUpdatedMs > 0 &&
          now - lastUpdatedMs < STALE_PRESERVE_MS;
        if (hasRecentValue) {
          preservedStale++;
          continue;
        }
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

    console.log(`🧮 Classification: ${zeroMilesCount} zero-miles, ${calculatedCount} calculated, ${skippedNoLocation} no location (${preservedStale} preserved <24h), ${skippedNoDestCoords} no dest coords`);

    // ── Step 4: Batch DB updates ──
    console.log(`💾 Step 4: Updating ${allUpdates.length} trucks in DB (batches of ${DB_BATCH_SIZE})...`);
    let dbUpdated = 0;
    let dbFailed = 0;

    for (let i = 0; i < allUpdates.length; i += DB_BATCH_SIZE) {
      const batch = allUpdates.slice(i, i + DB_BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (update) => {
          const patch: Record<string, unknown> = {
            miles_away: update.miles_away,
            eta_minutes: update.eta_minutes,
          };
          if (update.miles_away !== null) {
            patch.miles_away_updated_at = new Date().toISOString();
          }
          const { error } = await supabase
            .from('trucks')
            .update(patch)
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

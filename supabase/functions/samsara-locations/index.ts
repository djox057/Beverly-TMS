import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOCATION_BOUNDS = {
  minLat: 25.0,
  maxLat: 50.0,
  minLon: -125.0,
  maxLon: -65.0,
};

const MAX_LOCATION_AGE_MINUTES = 30;
const FETCH_TIMEOUT_MS = 15_000;
const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const CIRCUIT_BREAKER_THRESHOLD = 3;

function getLocationTime(vehicle: any): number {
  const loc = vehicle.location || vehicle.gps;
  if (loc?.time) return new Date(loc.time).getTime();
  return 0;
}

function isFresher(a: any, b: any): boolean {
  return getLocationTime(a) > getLocationTime(b);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey1 = Deno.env.get('SAMSARA_API_KEY_1');
    const apiKey2 = Deno.env.get('SAMSARA_API_KEY_2');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!apiKey1 || !apiKey2) {
      throw new Error('Samsara API keys not configured');
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!);

    // --- Circuit Breaker: check state (defensive try/catch) ---
    let circuitOpen = false;
    try {
      const { data: cbState } = await supabase
        .from('circuit_breaker_state')
        .select('consecutive_failures, circuit_open_until')
        .eq('function_name', 'samsara-locations')
        .maybeSingle();

      circuitOpen = !!(cbState?.circuit_open_until && new Date(cbState.circuit_open_until) > new Date());
    } catch (err) {
      console.warn('Circuit breaker check failed, proceeding with timeout protection:', err);
    }

    if (circuitOpen) {
      console.log('⚡ Circuit breaker OPEN — returning empty locations immediately');
      return new Response(
        JSON.stringify({ locations: [], stale: true, circuit_open: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Fetch trucks from DB ---
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select('id, truck_number');

    if (trucksError) throw trucksError;

    // --- Fetch from Samsara with 15s AbortController per call ---
    const apiKeys = [apiKey1, apiKey2];
    const allVehicles: any[] = [];
    let anySuccess = false;

    for (let keyIndex = 0; keyIndex < apiKeys.length; keyIndex++) {
      const apiKey = apiKeys[keyIndex];
      const endpoints = [
        'https://api.samsara.com/fleet/vehicles/locations',
        'https://api.samsara.com/fleet/vehicles',
      ];

      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              Accept: 'application/json',
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!response.ok) continue;

          const data = await response.json();
          const vehicles = data.data || [];
          vehicles.forEach((v: any) => allVehicles.push({ ...v, apiKeyIndex: keyIndex }));
          anySuccess = true;
          break; // got data from this key, skip fallback endpoint
        } catch (error) {
          clearTimeout(timeout);
          if ((error as any).name === 'AbortError') {
            console.warn(`⏱️ Samsara API timeout (${FETCH_TIMEOUT_MS / 1000}s) for key ${keyIndex + 1} at ${endpoint}`);
            continue;
          }
          console.error(`Error fetching from ${endpoint}:`, error);
        }
      }
    }

    // --- Circuit Breaker: update state (defensive try/catch) ---
    if (anySuccess) {
      try {
        await supabase
          .from('circuit_breaker_state')
          .update({
            consecutive_failures: 0,
            last_success_at: new Date().toISOString(),
            circuit_open_until: null,
            updated_at: new Date().toISOString(),
          })
          .eq('function_name', 'samsara-locations');
      } catch (err) {
        console.warn('Circuit breaker reset failed (non-fatal):', err);
      }
    } else {
      // All fetches failed/timed out
      try {
        const { data: currentState } = await supabase
          .from('circuit_breaker_state')
          .select('consecutive_failures')
          .eq('function_name', 'samsara-locations')
          .maybeSingle();

        const newFailures = (currentState?.consecutive_failures ?? 0) + 1;
        const updatePayload: any = {
          consecutive_failures: newFailures,
          updated_at: new Date().toISOString(),
        };

        if (newFailures >= CIRCUIT_BREAKER_THRESHOLD) {
          updatePayload.circuit_open_until = new Date(Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS).toISOString();
          console.warn(`🔴 Circuit breaker TRIPPED after ${newFailures} consecutive failures — open for 5 minutes`);
        }

        await supabase
          .from('circuit_breaker_state')
          .update(updatePayload)
          .eq('function_name', 'samsara-locations');
      } catch (err) {
        console.warn('Circuit breaker increment failed (non-fatal):', err);
      }

      console.warn('All Samsara API calls failed/timed out — returning empty locations');
      return new Response(
        JSON.stringify({ locations: [], stale: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetched ${allVehicles.length} vehicles, ${trucks?.length || 0} trucks in DB`);

    // Build a lookup map for fast matching
    const vehicleByName = new Map<string, any>();
    for (const v of allVehicles) {
      if (!v.name) continue;
      const key = String(v.name).toUpperCase().trim();
      const existing = vehicleByName.get(key);
      if (!existing || isFresher(v, existing)) {
        vehicleByName.set(key, v);
      }
    }

    const allLocations: any[] = [];
    let successfulMatches = 0;

    for (const truck of trucks || []) {
      const matchedVehicle = findMatchingVehicle(allVehicles, vehicleByName, truck.truck_number);

      if (matchedVehicle) {
        successfulMatches++;
        const location = matchedVehicle.location || matchedVehicle.gps;

        if (location && location.latitude && location.longitude) {
          const ageMinutes = location.time
            ? (Date.now() - new Date(location.time).getTime()) / 1000 / 60
            : 999999;
          const isValid = validateLocationBounds(location.latitude, location.longitude);

          if (isValid) {
            const now = new Date();
            const timestamp =
              location.time ||
              `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
                now.getDate()
              ).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(
                now.getMinutes()
              ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

            allLocations.push({
              truck_id: truck.id,
              truck_number: truck.truck_number,
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp,
              speed: location.speed || 0,
              ageMinutes,
              isValid: ageMinutes <= MAX_LOCATION_AGE_MINUTES,
              apiSource: matchedVehicle.apiKeyIndex,
            });
          }
        }
      }
    }

    console.log(`Matched ${successfulMatches}/${trucks?.length || 0} trucks, ${allLocations.length} valid locations`);

    return new Response(
      JSON.stringify({ locations: allLocations }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in samsara-locations:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Fast truck matching using a pre-built name lookup map + fallback patterns.
 * For fallback paths, collects ALL candidates and returns the freshest.
 */
function findMatchingVehicle(vehicles: any[], vehicleByName: Map<string, any>, truckNumber: string): any | null {
  if (!truckNumber) return null;

  const norm = String(truckNumber).replace(/^#/, '').trim();
  const pad4 = norm.padStart(4, '0');

  // Fast exact lookups via map (map already has freshest per name)
  const exactKeys = [
    `TRUCK ${pad4}`, `TRUCK #${pad4}`, `TRUCK${pad4}`,
    `TRUCK #${norm}`, `TRUCK ${norm}`, `TRUCK${norm}`,
    pad4, norm, String(truckNumber).toUpperCase().trim(),
  ];

  for (const key of exactKeys) {
    const match = vehicleByName.get(key.toUpperCase());
    if (match) return match;
  }

  // Regex fallbacks — collect ALL matches, return freshest
  const truckExactPattern = new RegExp(`^TRUCK\\s*#?0*${norm}$`, 'i');
  const truckWithSuffixPattern = new RegExp(`^TRUCK\\s*#?0*${norm}\\s*[-\\s]`, 'i');

  let candidates: any[] = [];

  for (const vehicle of vehicles) {
    if (!vehicle.name) continue;
    const vn = String(vehicle.name).trim();
    if (truckExactPattern.test(vn) || truckWithSuffixPattern.test(vn)) {
      candidates.push(vehicle);
    }
  }

  if (candidates.length > 0) {
    if (candidates.length > 1) {
      console.log(`⚠️ Duplicate match for truck ${norm}: ${candidates.map(c => `API_KEY_${c.apiKeyIndex + 1}:${c.name}@${getLocationTime(c)}`).join(' vs ')}`);
    }
    return candidates.reduce((best, c) => isFresher(c, best) ? c : best);
  }

  const completeNumberPattern = new RegExp(`(?<![0-9])0*${norm}(?![0-9])`, 'i');
  candidates = [];
  for (const vehicle of vehicles) {
    if (!vehicle.name) continue;
    const vn = String(vehicle.name).trim();
    if (completeNumberPattern.test(vn)) {
      const allNumbers = vn.match(/\d+/g) || [];
      if (allNumbers.some(n => n === norm || n === pad4 || n.replace(/^0+/, '') === norm.replace(/^0+/, ''))) {
        candidates.push(vehicle);
      }
    }
  }

  if (candidates.length > 0) {
    if (candidates.length > 1) {
      console.log(`⚠️ Duplicate match for truck ${norm}: ${candidates.map(c => `API_KEY_${c.apiKeyIndex + 1}:${c.name}@${getLocationTime(c)}`).join(' vs ')}`);
    }
    return candidates.reduce((best, c) => isFresher(c, best) ? c : best);
  }

  return null;
}

function validateLocationBounds(lat: number, lon: number): boolean {
  if (lat === 0 && lon === 0) return false;
  return lat >= LOCATION_BOUNDS.minLat && lat <= LOCATION_BOUNDS.maxLat &&
         lon >= LOCATION_BOUNDS.minLon && lon <= LOCATION_BOUNDS.maxLon;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { fetchSamsaraLocations } from "../_shared/samsara.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CIRCUIT_BREAKER_COOLDOWN_MS = 5 * 60 * 1000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const FETCH_LOCK_TIMEOUT_MS = 30 * 1000; // 30 seconds safety timeout

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

    // --- Circuit Breaker: check state ---
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

    // --- Cache check: return cached data if fresh ---
    let cachedLocations: any[] | null = null;
    let wonLock = false;

    try {
      const { data: cacheRow } = await supabase
        .from('samsara_locations_cache')
        .select('locations, fetched_at, is_fetching, fetch_started_at')
        .eq('id', 'latest')
        .maybeSingle();

      if (cacheRow) {
        const cacheAge = Date.now() - new Date(cacheRow.fetched_at).getTime();
        cachedLocations = cacheRow.locations as any[];

        if (cacheAge < CACHE_TTL_MS) {
          console.log(`📦 Cache HIT (${Math.round(cacheAge / 1000)}s old, ${cachedLocations?.length || 0} locations)`);
          return new Response(
            JSON.stringify({ locations: cachedLocations || [], cached: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Cache is stale — try to acquire fetch lock atomically
        const fetchStartedAge = cacheRow.fetch_started_at
          ? Date.now() - new Date(cacheRow.fetch_started_at).getTime()
          : Infinity;
        const lockExpired = fetchStartedAge > FETCH_LOCK_TIMEOUT_MS;

        if (!cacheRow.is_fetching || lockExpired) {
          if (cacheRow.is_fetching && lockExpired) {
            await supabase
              .from('samsara_locations_cache')
              .update({ is_fetching: false })
              .eq('id', 'latest');
          }

          const { data: lockResult } = await supabase
            .from('samsara_locations_cache')
            .update({ is_fetching: true, fetch_started_at: new Date().toISOString() })
            .eq('id', 'latest')
            .eq('is_fetching', false)
            .select('id');

          wonLock = (lockResult?.length ?? 0) > 0;
          if (wonLock) {
            console.log(`🔓 Won fetch lock — proceeding with Samsara API call`);
          }
        }

        if (!wonLock) {
          console.log(`🔒 Cache STALE but another caller is fetching — returning stale data (${cachedLocations?.length || 0} locations)`);
          return new Response(
            JSON.stringify({ locations: cachedLocations || [], stale: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (err) {
      console.warn('Cache check failed, proceeding with direct fetch:', err);
    }

    // --- Fetch from Samsara using shared utility ---
    const { locations: allLocations, anySuccess } = await fetchSamsaraLocations(
      supabase,
      [apiKey1, apiKey2],
    );

    // --- Circuit Breaker: update state ---
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
      // All fetches failed/timed out — release lock and return
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

      if (wonLock) {
        try {
          await supabase
            .from('samsara_locations_cache')
            .update({ is_fetching: false })
            .eq('id', 'latest');
        } catch (err) {
          console.warn('Failed to release fetch lock (non-fatal):', err);
        }
      }

      console.warn('All Samsara API calls failed/timed out — returning empty locations');
      return new Response(
        JSON.stringify({ locations: cachedLocations || [], stale: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // --- Update cache with fresh data ---
    try {
      await supabase
        .from('samsara_locations_cache')
        .update({
          locations: allLocations,
          fetched_at: new Date().toISOString(),
          is_fetching: false,
          fetch_started_at: null,
        })
        .eq('id', 'latest');
      console.log(`📦 Cache UPDATED with ${allLocations.length} locations`);
    } catch (err) {
      console.error('Failed to update cache (non-fatal):', err);
    }

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

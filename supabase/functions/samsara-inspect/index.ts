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

const FETCH_TIMEOUT_MS = 20_000;

function validateLocationBounds(lat: number, lon: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (lat === 0 && lon === 0) return false;
  return lat >= LOCATION_BOUNDS.minLat && lat <= LOCATION_BOUNDS.maxLat &&
         lon >= LOCATION_BOUNDS.minLon && lon <= LOCATION_BOUNDS.maxLon;
}

function extractNumbersFromName(name: string): string[] {
  return String(name || '').match(/\d+/g) || [];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Admin/accounting only
    const svc = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: roles } = await svc
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    const allowed = new Set(['admin', 'accounting']);
    const hasAccess = (roles || []).some((r: any) => allowed.has(r.role));
    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const url = new URL(req.url);
    let truckFilter = (url.searchParams.get('truck') || '').trim();
    if (!truckFilter && (req.method === 'POST' || req.method === 'PUT')) {
      try {
        const body = await req.json();
        if (body && typeof body.truck === 'string') truckFilter = body.truck.trim();
      } catch { /* ignore */ }
    }

    const apiKeys = [
      Deno.env.get('SAMSARA_API_KEY_1'),
      Deno.env.get('SAMSARA_API_KEY_2'),
      Deno.env.get('SAMSARA_API_KEY_3'),
      Deno.env.get('SAMSARA_API_KEY_4'),
      Deno.env.get('SAMSARA_API_KEY_5'),
    ];

    const keys: any[] = [];

    for (let i = 0; i < apiKeys.length; i++) {
      const apiKey = apiKeys[i];
      const label = `SAMSARA_API_KEY_${i + 1}`;
      if (!apiKey) {
        keys.push({ keyIndex: i, label, configured: false });
        continue;
      }

      const endpoints = [
        'https://api.samsara.com/fleet/vehicles/locations',
        'https://api.samsara.com/fleet/vehicles',
      ];

      let vehicles: any[] = [];
      let sourceEndpoint: string | null = null;
      let errorMsg: string | null = null;

      for (const endpoint of endpoints) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
          const res = await fetch(endpoint, {
            method: 'GET',
            headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!res.ok) {
            errorMsg = `HTTP ${res.status}`;
            continue;
          }
          const json = await res.json();
          vehicles = json.data || [];
          sourceEndpoint = endpoint;
          errorMsg = null;
          break;
        } catch (e: any) {
          clearTimeout(timeout);
          errorMsg = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'fetch error');
        }
      }

      const shaped = vehicles.map((v: any) => {
        const loc = v.location || v.gps || null;
        const lat = loc?.latitude;
        const lon = loc?.longitude;
        return {
          id: v.id,
          name: v.name,
          serial: v.serial,
          vin: v.vin,
          make: v.make,
          model: v.model,
          numbers: extractNumbersFromName(v.name),
          location: loc
            ? {
                latitude: lat,
                longitude: lon,
                time: loc.time,
                speed: loc.speed,
                reverseGeo: loc.reverseGeo,
                inBounds: validateLocationBounds(lat, lon),
                ageMinutes: loc.time
                  ? Math.round((Date.now() - new Date(loc.time).getTime()) / 60000)
                  : null,
              }
            : null,
        };
      });

      let filtered = shaped;
      if (truckFilter) {
        const norm = truckFilter.replace(/^#/, '').trim();
        const pad4 = norm.padStart(4, '0');
        filtered = shaped.filter((v) => {
          const nameU = String(v.name || '').toUpperCase();
          if (nameU.includes(norm.toUpperCase())) return true;
          return v.numbers.some((n: string) =>
            n === norm || n === pad4 || n.replace(/^0+/, '') === norm.replace(/^0+/, ''),
          );
        });
      }

      keys.push({
        keyIndex: i,
        label,
        configured: true,
        sourceEndpoint,
        recordCount: shaped.length,
        matchCount: filtered.length,
        error: errorMsg,
        vehicles: filtered,
      });
    }

    return new Response(
      JSON.stringify({ truckFilter: truckFilter || null, keys }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
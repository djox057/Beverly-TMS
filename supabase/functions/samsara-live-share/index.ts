import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FETCH_TIMEOUT_MS = 15_000;
const DEFAULT_HOURS = 168; // 7 days
const MAX_HOURS = 24 * 90; // 90 days

function extractNumbersFromName(name: string): string[] {
  return String(name || '').match(/\d+/g) || [];
}

function matchVehicle(vehicles: any[], truckNumber: string): any | null {
  if (!truckNumber) return null;
  const norm = String(truckNumber).replace(/^#/, '').trim();
  const pad4 = norm.padStart(4, '0');
  const exactRe = new RegExp(`^TRUCK\\s*#?0*${norm}(?:\\s|[-]|$)`, 'i');

  // Prefer names starting with "TRUCK <num>"
  for (const v of vehicles) {
    if (v?.name && exactRe.test(String(v.name).trim())) return v;
  }
  // Fallback: any name whose numeric tokens include our number
  for (const v of vehicles) {
    const nums = extractNumbersFromName(v?.name || '');
    if (nums.some((n) => n === norm || n === pad4 || n.replace(/^0+/, '') === norm.replace(/^0+/, ''))) {
      return v;
    }
  }
  return null;
}

async function fetchVehicles(apiKey: string): Promise<any[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      // fallback to vehicles list (no location)
      const res2 = await fetch('https://api.samsara.com/fleet/vehicles', {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      });
      if (!res2.ok) return null;
      const j2 = await res2.json();
      return j2.data || [];
    }
    const json = await res.json();
    return json.data || [];
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function createLiveShare(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const shareRes = await fetch('https://api.samsara.com/live-shares', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return {
    ok: shareRes.ok,
    status: shareRes.status,
    text: await shareRes.text(),
  };
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
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const truckNumber = String(body.truck_number || '').trim();
    const nameOverride = body.name ? String(body.name).trim() : '';
    let hours = Number(body.expires_in_hours ?? DEFAULT_HOURS);
    if (!Number.isFinite(hours) || hours <= 0) hours = DEFAULT_HOURS;
    if (hours > MAX_HOURS) hours = MAX_HOURS;

    if (!truckNumber) {
      return new Response(JSON.stringify({ error: 'truck_number is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKeys = [
      Deno.env.get('SAMSARA_API_KEY_1'),
      Deno.env.get('SAMSARA_API_KEY_2'),
      Deno.env.get('SAMSARA_API_KEY_3'),
      Deno.env.get('SAMSARA_API_KEY_4'),
      Deno.env.get('SAMSARA_API_KEY_5'),
      Deno.env.get('SAMSARA_API_KEY_6'),
      Deno.env.get('SAMSARA_API_KEY_7'),
    ];
    const apiKeyLabels = [
      'dispatch@bfprime.net',
      'Accounting@bfprime.net',
      'beverlyrepair@gmail.com',
      'zack@beverlyfreight.net',
      'dispatch@bgprime.net',
      'Dispatch@unitedenterprisesolutions.net',
      'tommy@beverlyfreight.net',
    ];

    // Find ALL keys/orgs that contain this truck, then pick the one with freshest location
    const candidates: Array<{ key: string; label: string; vehicle: any; ageMs: number }> = [];
    for (let i = 0; i < apiKeys.length; i++) {
      const key = apiKeys[i];
      if (!key) continue;
      const vehicles = await fetchVehicles(key);
      if (!vehicles) continue;
      const v = matchVehicle(vehicles, truckNumber);
      if (!v?.id) continue;
      const loc = v.location || v.gps || null;
      const t = loc?.time ? new Date(loc.time).getTime() : NaN;
      const ageMs = Number.isFinite(t) ? Date.now() - t : Number.POSITIVE_INFINITY;
      candidates.push({
        key,
        label: apiKeyLabels[i] || `SAMSARA_API_KEY_${i + 1}`,
        vehicle: v,
        ageMs,
      });
    }
    candidates.sort((a, b) => a.ageMs - b.ageMs);
    const best = candidates[0];
    const matchedKey = best?.key || null;
    const matchedLabel = best?.label || null;
    const matchedVehicle = best?.vehicle || null;
    console.log(
      `live-share match for ${truckNumber}: candidates=${candidates
        .map((c) => `${c.label}(age=${Math.round(c.ageMs / 60000)}m)`)
        .join(', ')} -> chose ${matchedLabel}`,
    );

    if (!matchedKey || !matchedVehicle) {
      return new Response(JSON.stringify({ error: `Truck ${truckNumber} not found in any Samsara org` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const endsAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const shareName = nameOverride || `TRUCK ${String(truckNumber).replace(/^#/, '')}`;

    const primaryPayload = {
      type: 'assetsLocation',
      name: shareName,
      expiresAtTime: endsAt,
      assetsLocationLinkConfig: {
        assetId: String(matchedVehicle.id),
      },
    };

    let shareResult = await createLiveShare(matchedKey, primaryPayload);

    // Compatibility fallback for Samsara schema variations between asset/vehicle naming.
    if (!shareResult.ok && shareResult.status === 400) {
      const fallbackPayload = {
        type: 'assetsLocation',
        name: shareName,
        expiresAtTime: endsAt,
        assetsLocationLinkConfig: {
          vehicleId: String(matchedVehicle.id),
        },
      };
      const fallbackResult = await createLiveShare(matchedKey, fallbackPayload);
      if (fallbackResult.ok) {
        shareResult = fallbackResult;
      }
    }

    const shareText = shareResult.text;
    if (!shareResult.ok) {
      console.error(`Samsara live-shares error [${shareResult.status}]: ${shareText}`);
      return new Response(
        JSON.stringify({ error: 'Samsara live-shares request failed', status: shareResult.status, details: shareText }),
        { status: shareResult.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let shareJson: any = {};
    try { shareJson = JSON.parse(shareText); } catch { /* ignore */ }
    const data = shareJson?.data || shareJson;
    const url: string | undefined = data?.liveSharingUrl || data?.url;

    if (!url) {
      console.error('Samsara live-shares returned no URL:', shareText);
      return new Response(
        JSON.stringify({ error: 'Samsara did not return a live share URL', details: shareText }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        url,
        expiresAt: endsAt,
        keyLabel: matchedLabel,
        vehicleId: matchedVehicle.id,
        vehicleName: matchedVehicle.name,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('samsara-live-share fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
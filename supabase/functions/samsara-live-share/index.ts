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
    const res = await fetch('https://api.samsara.com/fleet/vehicles', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || [];
  } catch {
    clearTimeout(timeout);
    return null;
  }
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

    // Find which key/org owns this truck
    let matchedKey: string | null = null;
    let matchedLabel: string | null = null;
    let matchedVehicle: any = null;

    for (let i = 0; i < apiKeys.length; i++) {
      const key = apiKeys[i];
      if (!key) continue;
      const vehicles = await fetchVehicles(key);
      if (!vehicles) continue;
      const v = matchVehicle(vehicles, truckNumber);
      if (v?.id) {
        matchedKey = key;
        matchedLabel = apiKeyLabels[i] || `SAMSARA_API_KEY_${i + 1}`;
        matchedVehicle = v;
        break;
      }
    }

    if (!matchedKey || !matchedVehicle) {
      return new Response(JSON.stringify({ error: `Truck ${truckNumber} not found in any Samsara org` }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const endsAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const shareName = nameOverride || `TRUCK ${String(truckNumber).replace(/^#/, '')}`;

    const shareRes = await fetch('https://api.samsara.com/live-shares', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${matchedKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: shareName,
        endsAtTime: endsAt,
        assets: [{ vehicleId: String(matchedVehicle.id) }],
      }),
    });

    const shareText = await shareRes.text();
    if (!shareRes.ok) {
      console.error(`Samsara live-shares error [${shareRes.status}]: ${shareText}`);
      return new Response(
        JSON.stringify({ error: 'Samsara live-shares request failed', status: shareRes.status, details: shareText }),
        { status: shareRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
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
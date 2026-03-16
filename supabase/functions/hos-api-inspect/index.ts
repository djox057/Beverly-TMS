import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const AUTH_URL = 'https://assets.transittracking.us/api/v1/auth';
const API_URL = 'https://assets.transittracking.us/api/v1/assets/currentWithTimers';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userId = claimsData.claims.sub;

    // Check admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin');

    if (!roles?.length) {
      return new Response(JSON.stringify({ error: 'Admin role required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Gather API keys
    const apiKeysEnv = Deno.env.get('TRANSIT_TRACKING_API_KEYS');
    const unitedApiKey = Deno.env.get('TRANSIT_TRACKING_API_KEY_UNITED');

    const apiKeys: string[] = [];
    if (apiKeysEnv) apiKeys.push(...apiKeysEnv.split(',').map(k => k.trim()).filter(k => k.length > 0));
    if (unitedApiKey?.trim()) apiKeys.push(unitedApiKey.trim());

    if (!apiKeys.length) {
      return new Response(JSON.stringify({ error: 'No API keys configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results: { keyIndex: number; recordCount: number; fieldNames: string[]; samples: unknown[] }[] = [];

    for (let i = 0; i < apiKeys.length; i++) {
      try {
        // Authenticate
        const authResp = await fetch(AUTH_URL, {
          method: 'GET',
          headers: { 'client_key': apiKeys[i], 'Accept': 'application/json' }
        });
        if (authResp.status !== 200) {
          const body = await authResp.text();
          results.push({ keyIndex: i, recordCount: 0, fieldNames: [], samples: [{ error: `Auth failed: ${authResp.status}`, body }] });
          continue;
        }
        const authJson = await authResp.json();
        const bearerToken = authJson.token;
        if (!bearerToken) {
          results.push({ keyIndex: i, recordCount: 0, fieldNames: [], samples: [{ error: 'No token in auth response' }] });
          continue;
        }

        // Fetch data
        const dataResp = await fetch(`${API_URL}?additionalInfo=true`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${bearerToken}`, 'Accept': 'application/json' }
        });
        if (dataResp.status !== 200) {
          const body = await dataResp.text();
          results.push({ keyIndex: i, recordCount: 0, fieldNames: [], samples: [{ error: `Data fetch failed: ${dataResp.status}`, body }] });
          continue;
        }

        const json = await dataResp.json();
        const records = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];

        // Collect all unique field names across all records (some records may have different fields)
        const allFields = new Set<string>();
        for (const rec of records) {
          if (rec && typeof rec === 'object') {
            Object.keys(rec).forEach(k => allFields.add(k));
          }
        }

        results.push({
          keyIndex: i,
          recordCount: records.length,
          fieldNames: Array.from(allFields).sort(),
          samples: records.slice(0, 3),
        });
      } catch (err) {
        results.push({ keyIndex: i, recordCount: 0, fieldNames: [], samples: [{ error: String(err) }] });
      }
    }

    return new Response(JSON.stringify({ keys: results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

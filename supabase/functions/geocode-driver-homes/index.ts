import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
    if (!mapboxToken) throw new Error('MAPBOX_PUBLIC_TOKEN not set');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const url = new URL(req.url);
    const onlyMissing = url.searchParams.get('all') !== '1';

    let query = supabase
      .from('drivers')
      .select('id, name, home_address, home_city, home_state, home_latitude, home_longitude')
      .eq('is_active', true);
    if (onlyMissing) query = query.is('home_latitude', null);

    const { data: drivers, error } = await query;
    if (error) throw error;

    const results = { total: drivers?.length ?? 0, geocoded: 0, skipped: 0, failed: 0, errors: [] as any[] };

    for (const d of drivers ?? []) {
      const parts = [d.home_address, d.home_city, d.home_state].map((p) => (p ?? '').trim()).filter(Boolean);
      if (parts.length === 0) { results.skipped++; continue; }
      const q = parts.join(', ');

      try {
        const resp = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${mapboxToken}&country=us&limit=1`
        );
        const json = await resp.json();
        const feat = json?.features?.[0];
        if (!feat?.center) { results.failed++; results.errors.push({ id: d.id, name: d.name, q, reason: 'no_match' }); continue; }
        const [lng, lat] = feat.center;

        const { error: upErr } = await supabase
          .from('drivers')
          .update({ home_latitude: lat, home_longitude: lng })
          .eq('id', d.id);
        if (upErr) { results.failed++; results.errors.push({ id: d.id, name: d.name, q, reason: upErr.message }); continue; }
        results.geocoded++;
      } catch (e) {
        results.failed++;
        results.errors.push({ id: d.id, name: d.name, q, reason: String(e) });
      }

      // Polite throttle for Mapbox
      await new Promise((r) => setTimeout(r, 80));
    }

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
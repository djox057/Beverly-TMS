import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized request - invalid or missing CRON_SECRET');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate yesterday's date in Chicago timezone
    const now = new Date();
    const chicagoFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = chicagoFormatter.formatToParts(now);
    const year = parts.find(p => p.type === 'year')!.value;
    const month = parts.find(p => p.type === 'month')!.value;
    const day = parts.find(p => p.type === 'day')!.value;
    
    // Yesterday
    const todayDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
    todayDate.setDate(todayDate.getDate() - 1);
    const yesterday = todayDate.toISOString().split('T')[0];

    // Allow override via query param
    const url = new URL(req.url);
    const targetDate = url.searchParams.get('date') || yesterday;

    console.log(`Recording empty days for date: ${targetDate}`);

    // Call the RPC for a single day
    const { data, error } = await supabase.rpc(
      'calculate_empty_days_by_dispatcher',
      {
        p_start_date: targetDate,
        p_end_date: targetDate,
        p_office: null,
      }
    );

    if (error) {
      console.error('RPC error:', error);
      throw error;
    }

    console.log(`RPC returned ${(data || []).length} dispatcher results`);

    // Upsert results into snapshot table
    let upsertCount = 0;
    for (const row of (data || [])) {
      const { error: upsertError } = await supabase
        .from('dispatcher_daily_empty_days')
        .upsert({
          dispatcher_id: row.dispatcher_id,
          office: row.office,
          date: targetDate,
          empty_day_count: Number(row.empty_day_count),
        }, {
          onConflict: 'dispatcher_id,date',
        });

      if (upsertError) {
        console.error(`Upsert error for dispatcher ${row.dispatcher_id}:`, upsertError);
      } else {
        upsertCount++;
      }
    }

    console.log(`Upserted ${upsertCount} records`);

    return new Response(
      JSON.stringify({
        success: true,
        date: targetDate,
        dispatchers_recorded: upsertCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in record-empty-days:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

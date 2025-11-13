import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting dispatcher driver count recording...');

    // Get current date in YYYY-MM-DD format
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    console.log(`Recording counts for date: ${today}`);

    // Get all active drivers grouped by dispatcher
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('dispatcher_id')
      .eq('is_active', true)
      .not('dispatcher_id', 'is', null);

    if (driversError) {
      console.error('Error fetching drivers:', driversError);
      throw driversError;
    }

    // Count drivers per dispatcher
    const dispatcherCounts = new Map<string, number>();
    drivers?.forEach((driver) => {
      const dispatcherId = driver.dispatcher_id;
      if (dispatcherId) {
        dispatcherCounts.set(
          dispatcherId,
          (dispatcherCounts.get(dispatcherId) || 0) + 1
        );
      }
    });

    console.log(`Found ${dispatcherCounts.size} dispatchers with drivers`);

    // Insert or update counts for each dispatcher
    const results = [];
    for (const [dispatcherId, count] of dispatcherCounts.entries()) {
      const { data, error } = await supabase
        .from('dispatcher_daily_driver_counts')
        .upsert({
          dispatcher_id: dispatcherId,
          date: today,
          driver_count: count,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'dispatcher_id,date',
        })
        .select()
        .single();

      if (error) {
        console.error(`Error recording count for dispatcher ${dispatcherId}:`, error);
      } else {
        console.log(`Recorded ${count} drivers for dispatcher ${dispatcherId}`);
        results.push({ dispatcher_id: dispatcherId, count });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        recorded_counts: results,
        message: `Recorded driver counts for ${results.length} dispatchers`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in record-dispatcher-driver-counts:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

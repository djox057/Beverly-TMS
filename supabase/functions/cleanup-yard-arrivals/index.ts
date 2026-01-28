import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate CRON_SECRET for scheduled job authentication
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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current date in Chicago timezone (America/Chicago)
    const chicagoNow = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const chicagoDate = new Date(chicagoNow);
    const chicagoToday = chicagoDate.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`Running cleanup at Chicago time: ${chicagoNow}, date: ${chicagoToday}`);

    // NOTE: Yard actions are no longer automatically deleted - they persist until manually removed

    // 2. Process checked 2-week notice drivers where block date has passed
    const { data: twoWeekDrivers, error: twoWeekFetchError } = await supabase
      .from('drivers')
      .select('id, two_week_block_date')
      .eq('is_checked_for_termination', true)
      .not('two_week_block_date', 'is', null);

    if (twoWeekFetchError) {
      console.error('Error fetching 2-week notice drivers:', twoWeekFetchError);
      throw twoWeekFetchError;
    }

    let terminatedDrivers = 0;
    if (twoWeekDrivers && twoWeekDrivers.length > 0) {
      for (const driver of twoWeekDrivers) {
        if (driver.two_week_block_date && driver.two_week_block_date < chicagoToday) {
          // 1. Update driver record - terminate and disconnect
          const { error: updateError } = await supabase
            .from('drivers')
            .update({
              is_active: false,
              termination_date: driver.two_week_block_date,
              dispatcher_id: null,
              two_week_block_date: null,
              is_checked_for_termination: false,
            })
            .eq('id', driver.id);

          if (updateError) {
            console.error(`Error updating driver ${driver.id}:`, updateError);
            continue;
          }

          // 2. Disconnect from any truck as driver1
          const { error: driver1Error } = await supabase
            .from('trucks')
            .update({ driver1_id: null })
            .eq('driver1_id', driver.id);

          if (driver1Error) {
            console.error(`Error disconnecting driver1 ${driver.id}:`, driver1Error);
          }

          // 3. Disconnect from any truck as driver2
          const { error: driver2Error } = await supabase
            .from('trucks')
            .update({ driver2_id: null })
            .eq('driver2_id', driver.id);

          if (driver2Error) {
            console.error(`Error disconnecting driver2 ${driver.id}:`, driver2Error);
          }

          terminatedDrivers++;
          console.log(`Terminated driver ${driver.id}`);
        }
      }
    }
    console.log(`Terminated ${terminatedDrivers} drivers from 2-week notice`);

    return new Response(
      JSON.stringify({
        success: true,
        terminatedDrivers,
        chicagoDate: chicagoToday,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

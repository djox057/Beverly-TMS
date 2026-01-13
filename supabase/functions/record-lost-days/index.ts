import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get current time in Chicago
    const chicagoTime = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
    const chicagoDate = new Date(chicagoTime);
    const currentHour = chicagoDate.getHours();
    const todayStr = chicagoDate.toISOString().split('T')[0];

    console.log(`Recording lost days - Chicago time: ${chicagoTime}, hour: ${currentHour}, date: ${todayStr}`);

    // Only run at 10am Chicago time (unless forced via query param)
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';
    
    if (!force && currentHour !== 10) {
      console.log('Not 10am Chicago time, skipping');
      return new Response(
        JSON.stringify({ message: 'Not 10am Chicago time, skipping', hour: currentHour }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all dispatchers who are currently off duty
    const { data: offDutyDispatchers, error: fetchError } = await supabaseAdmin
      .from('dispatcher_status')
      .select('dispatcher_id')
      .eq('is_active', false);

    if (fetchError) {
      console.error('Error fetching off-duty dispatchers:', fetchError);
      throw fetchError;
    }

    if (!offDutyDispatchers || offDutyDispatchers.length === 0) {
      console.log('No off-duty dispatchers found');
      return new Response(
        JSON.stringify({ message: 'No off-duty dispatchers found', date: todayStr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${offDutyDispatchers.length} off-duty dispatchers`);

    const results = [];

    for (const dispatcher of offDutyDispatchers) {
      // Record lost day for each off-duty dispatcher (upsert to prevent duplicates)
      const { error: insertError } = await supabaseAdmin
        .from('dispatcher_off_duty_days')
        .upsert({
          dispatcher_id: dispatcher.dispatcher_id,
          off_duty_date: todayStr,
          created_by: null // System-generated
        }, {
          onConflict: 'dispatcher_id,off_duty_date',
          ignoreDuplicates: true
        });

      if (insertError) {
        console.error(`Error recording lost day for dispatcher ${dispatcher.dispatcher_id}:`, insertError);
        results.push({ dispatcherId: dispatcher.dispatcher_id, status: 'error', error: insertError.message });
      } else {
        console.log(`Recorded lost day for dispatcher ${dispatcher.dispatcher_id}`);
        results.push({ dispatcherId: dispatcher.dispatcher_id, status: 'recorded' });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        date: todayStr,
        processedDispatchers: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in record-lost-days:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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
    // NOTE: 2-week notice drivers are no longer automatically terminated - they must be manually processed

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Cleanup job executed - no auto-deletions configured',
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

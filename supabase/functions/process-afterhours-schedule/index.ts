import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY (like cleanup-yard-arrivals)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  let authMethod = 'none';

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authMethod = 'cron_secret';
  } else if (serviceRoleKey && authHeader?.includes(serviceRoleKey)) {
    authMethod = 'service_role';
  }

  if (authMethod === 'none') {
    console.error('Unauthorized request - no valid auth method matched');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`Auth method: ${authMethod}`);

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Parse action from body or query param
    const url = new URL(req.url);
    let action: string | null = null;
    try {
      const body = await req.json();
      action = body?.action || null;
    } catch { /* no body */ }
    action = action || url.searchParams.get('action');

    if (action !== 'start' && action !== 'end') {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid action. Must be "start" or "end".' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get today's date in Chicago timezone (DST-safe)
    const chicagoNow = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
    const d = new Date(chicagoNow);
    const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    console.log(`Action: ${action}, Chicago date: ${todayStr}, auth: ${authMethod}`);

    // Get scheduled user IDs for today
    const { data: scheduledUsers, error: fetchError } = await supabaseAdmin
      .from('afterhours_schedule')
      .select('user_id')
      .eq('scheduled_date', todayStr);

    if (fetchError) throw fetchError;

    console.log(`Scheduled users found: ${scheduledUsers?.length ?? 0}`);

    if (!scheduledUsers || scheduledUsers.length === 0) {
      console.log('No users scheduled for today');
      return new Response(
        JSON.stringify({ message: 'No users scheduled', date: todayStr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const fromRole = action === 'start' ? 'dispatch' : 'afterhours';
    const toRole = action === 'start' ? 'afterhours' : 'dispatch';
    const results = [];

    for (const { user_id } of scheduledUsers) {
      if (!user_id) continue;

      const { error: updateErr, count } = await supabaseAdmin
        .from('user_roles')
        .update({ role: toRole }, { count: 'exact' })
        .eq('user_id', user_id)
        .eq('role', fromRole);

      if (updateErr) {
        console.error(`User ${user_id}: update failed:`, updateErr);
        results.push({ user_id, status: 'error', error: updateErr.message });
      } else if (count === 0) {
        console.log(`User ${user_id}: no ${fromRole} role found, skipped`);
        results.push({ user_id, status: 'skipped' });
      } else {
        console.log(`User ${user_id}: ${fromRole} → ${toRole}`);
        results.push({ user_id, status: `${fromRole} → ${toRole}` });
      }
    }

    console.log(`Results: ${results.filter(r => r.status.includes('→')).length} switched, ${results.filter(r => r.status === 'skipped').length} skipped, ${results.filter(r => r.status === 'error').length} errors`);

    return new Response(
      JSON.stringify({ success: true, action, date: todayStr, authMethod, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

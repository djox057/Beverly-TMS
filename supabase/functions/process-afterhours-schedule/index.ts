import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const invocationId = crypto.randomUUID();
  const chicagoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  const chicagoHour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })
  );

  // Parse action early (needed for DST self-check)
  const url = new URL(req.url);
  let action: string | null = url.searchParams.get('action');
  let bodyJson: any = null;
  try {
    bodyJson = await req.json();
    action = action || bodyJson?.action || null;
  } catch { /* no body */ }

  if (action !== 'start' && action !== 'end') {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid action. Must be "start" or "end".' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // DST self-check: only run at the actual target Chicago hour
  const targetHour = action === 'start' ? 7 : 18;
  if (chicagoHour !== targetHour) {
    console.log(`[${invocationId}] Skipping: Chicago hour=${chicagoHour}, expected=${targetHour}, action=${action}`);
    return new Response(
      JSON.stringify({ success: true, skipped: true, reason: 'wrong-hour', chicagoHour, targetHour }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Auth: CRON_SECRET header (primary), then anon-key bearer (cron), then fall back to existing checks
  const cronSecret = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('Authorization');
  const cronSecretEnv = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  let authMethod: string | null = null;

  if (cronSecretEnv && cronSecret === cronSecretEnv) {
    authMethod = 'cron-secret';
  } else if (cronSecretEnv && authHeader === `Bearer ${cronSecretEnv}`) {
    authMethod = 'cron-secret-bearer';
  } else if (anonKey && authHeader === `Bearer ${anonKey}`) {
    authMethod = 'anon-bearer';
  } else if (serviceRoleKey && authHeader?.includes(serviceRoleKey)) {
    authMethod = 'service-role';
  } else if (authHeader?.startsWith('Bearer ')) {
    try {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userErr } = await adminClient.auth.getUser(token);
      if (!userErr && user?.id) {
        const { data: roles } = await adminClient
          .from('user_roles').select('role').eq('user_id', user.id);
        const userRoles = (roles || []).map((r: any) => r.role);
        if (userRoles.includes('admin') || userRoles.includes('manager')) {
          authMethod = 'jwt-admin';
        }
      }
    } catch (e) {
      console.error(`[${invocationId}] JWT auth check failed:`, e);
    }
  }

  if (!authMethod) {
    console.error(`[${invocationId}] Unauthorized request`);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[${invocationId}] action=${action} chicagoDate=${chicagoDate} auth=${authMethod}`);

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Insert started log row
  const { data: logRow, error: logInsertErr } = await supabaseAdmin
    .from('afterhours_cron_log')
    .insert({
      function_name: 'process-afterhours-schedule',
      invocation_id: invocationId,
      chicago_date: chicagoDate,
      auth_method: authMethod,
      payload: { action, chicagoHour, targetHour },
    })
    .select('id')
    .single();

  if (logInsertErr) {
    console.error(`[${invocationId}] Failed to insert cron log:`, logInsertErr);
  }
  const logId = logRow?.id;

  // Background work
  const work = async () => {
    let processed = 0;
    let success = false;
    let errorMessage: string | null = null;
    try {
      const { data: scheduledUsers, error: fetchError } = await supabaseAdmin
        .from('afterhours_schedule')
        .select('user_id')
        .eq('scheduled_date', chicagoDate);

      if (fetchError) throw fetchError;
      console.log(`[${invocationId}] Scheduled users: ${scheduledUsers?.length ?? 0}`);

      if (!scheduledUsers || scheduledUsers.length === 0) {
        success = true;
      } else {
        const fromRole = action === 'start' ? 'dispatch' : 'afterhours';
        const toRole = action === 'start' ? 'afterhours' : 'dispatch';

        for (const { user_id } of scheduledUsers) {
          if (!user_id) continue;
          const { error: updateErr, count } = await supabaseAdmin
            .from('user_roles')
            .update({ role: toRole }, { count: 'exact' })
            .eq('user_id', user_id)
            .eq('role', fromRole);

          if (updateErr) {
            console.error(`[${invocationId}] User ${user_id}: update failed:`, updateErr);
          } else if (count && count > 0) {
            processed++;
            console.log(`[${invocationId}] User ${user_id}: ${fromRole} → ${toRole}`);
          } else {
            console.log(`[${invocationId}] User ${user_id}: no ${fromRole} role found, skipped`);
          }
        }
        success = true;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[${invocationId}] Work failed:`, errorMessage);
    } finally {
      if (logId) {
        await supabaseAdmin
          .from('afterhours_cron_log')
          .update({
            completed_at: new Date().toISOString(),
            success,
            processed_count: processed,
            error_message: errorMessage,
          })
          .eq('id', logId);
      }
      console.log(`[${invocationId}] Done. processed=${processed} success=${success}`);
    }
  };

  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work());
  } else {
    work();
  }

  return new Response(
    JSON.stringify({ success: true, accepted: true, invocationId, action, chicagoDate, authMethod }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

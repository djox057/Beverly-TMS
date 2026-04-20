import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CHUNK_SIZE = 30; // ~45s per chunk at 1.5s spacing
const SMS_SPACING_MS = 1500;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SendDetail = {
  assignment_id: string;
  driver_id: string;
  driver_name: string | null;
  dispatcher_name: string | null;
  status: 'sent' | 'failed' | 'skipped';
  reason?: string;
  rc_message_id?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Parse body. Supported flags:
  //   - manual: true            → human-triggered (admin/manager UI). Bypasses hour & schedule guards. Sync, one chunk.
  //   - target_date: 'YYYY-MM-DD' → override Chicago date
  //   - invocationId / offset / chicagoDate → self-invoked next chunk (cron path only)
  let body: any = {};
  try {
    if (req.method === 'POST') body = await req.clone().json();
  } catch {}

  const isManual: boolean = body?.manual === true;
  const isSelfInvoke: boolean = !!body?.invocationId && !isManual;
  const invocationId: string = body?.invocationId ?? crypto.randomUUID();
  const offset: number = Number.isFinite(body?.offset) ? Number(body.offset) : 0;

  let chicagoDate: string;
  if (body?.chicagoDate) {
    chicagoDate = body.chicagoDate;
  } else if (body?.target_date) {
    chicagoDate = body.target_date;
  } else {
    chicagoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
  }
  const chicagoHour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false })
  );

  // Auth methods (in order of preference):
  //   1. cron-header   — pg_cron via x-cron-secret env match
  //   2. service-role  — pg_cron via Bearer SUPABASE_SERVICE_ROLE_KEY (current production cron pattern)
  //   3. jwt-admin     — logged-in admin/manager user JWT (manual UI invocation)
  // The previous anon-key bearer branch was removed (security: anon key ships in frontend bundle).
  // The previous cron-bearer-secret branch was removed (no callers in production cron jobs).
  const cronSecretHeader = req.headers.get('x-cron-secret');
  const authHeader = req.headers.get('Authorization');
  let authMethod: string | null = null;

  if (CRON_SECRET && cronSecretHeader === CRON_SECRET) {
    authMethod = 'cron-header';
  } else if (SERVICE_ROLE_KEY && authHeader === `Bearer ${SERVICE_ROLE_KEY}`) {
    authMethod = 'service-role';
  } else if (authHeader?.startsWith('Bearer ')) {
    try {
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (!userErr && user?.id) {
        const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { data: roles } = await adminClient
          .from('user_roles').select('role').eq('user_id', user.id);
        if (roles?.some((r: any) => r.role === 'admin' || r.role === 'manager')) {
          authMethod = 'jwt-admin';
        }
      }
    } catch (e) {
      console.error(`[${invocationId}] JWT check failed:`, e);
    }
  }

  if (!authMethod) {
    console.error(`[${invocationId}] Unauthorized`);
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Manual invocations are humans clicking a button — must come from a real admin/manager session,
  // not from the cron auth paths. Block accidental misuse.
  if (isManual && authMethod !== 'jwt-admin') {
    console.error(`[${invocationId}] Forbidden: manual=true requires jwt-admin (got ${authMethod})`);
    return new Response(
      JSON.stringify({ error: 'Forbidden: manual invocation requires user authentication' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // DST hour guard applies ONLY to the initial cron fire.
  // Manual invocations bypass it (manager knows what they're doing).
  // Self-invoked chained chunks bypass it (may run past the hour boundary).
  const isInitialCronFire = !isSelfInvoke && !isManual && !body?.target_date;
  if (isInitialCronFire && chicagoHour !== 8) {
    console.log(`[${invocationId}] Skipping: Chicago hour=${chicagoHour}, expected=8`);
    return new Response(
      JSON.stringify({ success: true, skipped: true, reason: 'wrong-hour', chicagoHour }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`[${invocationId}] start chicagoDate=${chicagoDate} offset=${offset} self=${isSelfInvoke} manual=${isManual} auth=${authMethod}`);

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Schedule check (skip for manual + self-invoke; only the initial cron fire enforces it).
  if (!isSelfInvoke && !isManual) {
    const { data: schedule, error: schedErr } = await supabaseAdmin
      .from('afterhours_schedule')
      .select('id')
      .eq('scheduled_date', chicagoDate)
      .limit(1);
    if (schedErr) {
      console.error(`[${invocationId}] schedule check error:`, schedErr);
    }
    if (!schedule || schedule.length === 0) {
      console.log(`[${invocationId}] Not a scheduled day, exiting`);
      await supabaseAdmin.from('afterhours_cron_log').insert({
        function_name: 'send-afterhours-sms',
        invocation_id: invocationId,
        chicago_date: chicagoDate,
        auth_method: authMethod,
        completed_at: new Date().toISOString(),
        success: true,
        expected_count: 0,
        processed_count: 0,
        payload: { reason: 'not-scheduled-day' },
      });
      return new Response(
        JSON.stringify({ success: true, message: 'Not a scheduled day', chicagoDate }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Insert log on initial fire only
  let logId: number | null = null;
  if (!isSelfInvoke) {
    const { count: totalAssignments } = await supabaseAdmin
      .from('afterhours_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('scheduled_date', chicagoDate);

    const { data: logRow, error: logErr } = await supabaseAdmin
      .from('afterhours_cron_log')
      .insert({
        function_name: 'send-afterhours-sms',
        invocation_id: invocationId,
        chicago_date: chicagoDate,
        auth_method: authMethod,
        expected_count: totalAssignments ?? 0,
        payload: { initial: true },
      })
      .select('id')
      .single();
    if (logErr) console.error(`[${invocationId}] log insert err:`, logErr);
    logId = logRow?.id ?? null;
  } else {
    // Lookup existing log row by invocationId for completion update later
    const { data: existing } = await supabaseAdmin
      .from('afterhours_cron_log')
      .select('id')
      .eq('invocation_id', invocationId)
      .eq('function_name', 'send-afterhours-sms')
      .limit(1)
      .single();
    logId = existing?.id ?? null;
  }

  const work = async () => {
    try {
      // Fetch this chunk
      const { data: assignments, error: assignErr } = await supabaseAdmin
        .from('afterhours_assignments')
        .select('id, afterhours_user_id, driver_id')
        .eq('scheduled_date', chicagoDate)
        .order('id', { ascending: true })
        .range(offset, offset + CHUNK_SIZE - 1);

      if (assignErr) throw assignErr;

      console.log(`[${invocationId}] chunk offset=${offset} got=${assignments?.length ?? 0}`);

      if (!assignments || assignments.length === 0) {
        // No more to process — mark complete
        await finishLog(supabaseAdmin, logId, true, null);
        return;
      }

      // Fetch dispatcher + driver info
      const dispatcherIds = [...new Set(assignments.map((a) => a.afterhours_user_id))];
      const driverIds = [...new Set(assignments.map((a) => a.driver_id))];

      const [profilesRes, driversRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('user_id, full_name, phone_number').in('user_id', dispatcherIds),
        supabaseAdmin.from('drivers').select('id, phone, name').in('id', driverIds),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (driversRes.error) throw driversRes.error;

      const profileMap = new Map(profilesRes.data!.map((p: any) => [p.user_id, p]));
      const driverMap = new Map(driversRes.data!.map((d: any) => [d.id, d]));

      // RingCentral auth
      const CLIENT_ID = Deno.env.get('RINGCENTRAL_CLIENT_ID');
      const CLIENT_SECRET = Deno.env.get('RINGCENTRAL_CLIENT_SECRET');
      const JWT_TOKEN = Deno.env.get('RINGCENTRAL_JWT_TOKEN');
      const SERVER_URL = Deno.env.get('RINGCENTRAL_SERVER_URL') || 'https://platform.ringcentral.com';
      const FROM_NUMBER = Deno.env.get('RINGCENTRAL_PHONE_NUMBER');
      if (!CLIENT_ID || !CLIENT_SECRET || !JWT_TOKEN || !FROM_NUMBER) {
        throw new Error('Missing RingCentral credentials');
      }

      const authResp = await fetch(`${SERVER_URL}/restapi/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
        },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${JWT_TOKEN}`,
      });
      if (!authResp.ok) throw new Error(`RingCentral auth failed: ${await authResp.text()}`);
      const { access_token } = await authResp.json();

      // Process each assignment
      for (let i = 0; i < assignments.length; i++) {
        const a = assignments[i];
        const driver = driverMap.get(a.driver_id);
        const dispatcher = profileMap.get(a.afterhours_user_id);

        // Idempotency check
        const { data: existing } = await supabaseAdmin
          .from('afterhours_sms_send_log')
          .select('id, success')
          .eq('assignment_id', a.id)
          .eq('chicago_date', chicagoDate)
          .maybeSingle();
        if (existing?.success) {
          console.log(`[${invocationId}] driver=${a.driver_id} assignment=${a.id} skip=already-sent`);
          continue;
        }

        if (!dispatcher?.full_name || !dispatcher?.phone_number) {
          console.log(`[${invocationId}] driver=${a.driver_id} assignment=${a.id} skip=dispatcher-missing-info`);
          await supabaseAdmin.from('afterhours_sms_send_log').insert({
            assignment_id: a.id, driver_id: a.driver_id, chicago_date: chicagoDate,
            invocation_id: invocationId, success: false, error_message: 'dispatcher missing info',
          });
          continue;
        }
        if (!driver?.phone) {
          console.log(`[${invocationId}] driver=${a.driver_id} assignment=${a.id} skip=no-driver-phone`);
          await supabaseAdmin.from('afterhours_sms_send_log').insert({
            assignment_id: a.id, driver_id: a.driver_id, chicago_date: chicagoDate,
            invocation_id: invocationId, success: false, error_message: 'driver no phone',
          });
          continue;
        }

        // Build message
        const nameParts = dispatcher.full_name.trim().split(/\s+/);
        const lastWord = nameParts[nameParts.length - 1];
        const lastName = lastWord.includes('-') ? lastWord.split('-').pop()! : lastWord;
        const dispatcherPhone = String(dispatcher.phone_number).replace(/^\+1\s?/, '');
        const message = `Good morning, your dispatcher for today will be ${lastName}, you can contact him directly via this number ${dispatcherPhone}`;

        // Send with retries on rate limit
        let ok = false;
        let rcMessageId: string | null = null;
        let errMsg: string | null = null;
        const retries = 3;
        for (let attempt = 0; attempt < retries; attempt++) {
          const smsResp = await fetch(`${SERVER_URL}/restapi/v1.0/account/~/extension/~/sms`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: { phoneNumber: FROM_NUMBER },
              to: [{ phoneNumber: driver.phone }],
              text: message,
            }),
          });
          if (smsResp.ok) {
            const data = await smsResp.json();
            rcMessageId = data.id;
            ok = true;
            break;
          }
          const errText = await smsResp.text();
          if (errText.includes('CMN-301') && attempt < retries - 1) {
            const backoff = (attempt + 1) * 3000;
            console.log(`[${invocationId}] driver=${a.driver_id} rate-limited, backoff=${backoff}ms`);
            await delay(backoff);
            continue;
          }
          errMsg = errText;
          break;
        }

        await supabaseAdmin.from('afterhours_sms_send_log').insert({
          assignment_id: a.id, driver_id: a.driver_id, chicago_date: chicagoDate,
          invocation_id: invocationId, success: ok, rc_message_id: rcMessageId, error_message: errMsg,
        });

        console.log(`[${invocationId}] driver=${a.driver_id} assignment=${a.id} success=${ok}`);

        if (i < assignments.length - 1) {
          await delay(SMS_SPACING_MS);
        }
      }

      // Chunk done — chain next
      if (assignments.length === CHUNK_SIZE) {
        const nextOffset = offset + CHUNK_SIZE;
        console.log(`[${invocationId}] chaining next chunk offset=${nextOffset}`);
        const selfUrl = `${SUPABASE_URL}/functions/v1/send-afterhours-sms`;
        // Fire and forget
        fetch(selfUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-cron-secret': CRON_SECRET,
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY') ?? ''}`,
          },
          body: JSON.stringify({ offset: nextOffset, invocationId, chicagoDate }),
        }).catch((e) => console.error(`[${invocationId}] self-invoke failed:`, e));
      } else {
        // Final chunk
        await finishLog(supabaseAdmin, logId, true, null);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${invocationId}] work failed:`, msg);
      await finishLog(supabaseAdmin, logId, false, msg);
    }
  };

  // @ts-ignore
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(work());
  } else {
    work();
  }

  return new Response(
    JSON.stringify({ success: true, accepted: true, invocationId, chicagoDate, offset, authMethod }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});

async function finishLog(client: any, logId: number | null, success: boolean, errorMessage: string | null) {
  if (!logId) return;
  // Count actual sends from log
  try {
    const { data: row } = await client
      .from('afterhours_cron_log').select('chicago_date').eq('id', logId).single();
    if (row?.chicago_date) {
      const { count } = await client
        .from('afterhours_sms_send_log')
        .select('*', { count: 'exact', head: true })
        .eq('chicago_date', row.chicago_date)
        .eq('success', true);
      await client.from('afterhours_cron_log').update({
        completed_at: new Date().toISOString(),
        success,
        processed_count: count ?? 0,
        error_message: errorMessage,
      }).eq('id', logId);
    }
  } catch (e) {
    console.error('finishLog failed:', e);
  }
}

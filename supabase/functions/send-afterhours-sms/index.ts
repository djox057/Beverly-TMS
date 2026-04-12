import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Auth: accept CRON_SECRET, SERVICE_ROLE_KEY, or authenticated admin/manager JWT
  const cronSecret = Deno.env.get('CRON_SECRET');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('Authorization');
  let authMethod = 'none';
  let targetDate: string | null = null;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    authMethod = 'cron_secret';
  } else if (serviceRoleKey && authHeader?.includes(serviceRoleKey)) {
    authMethod = 'service_role';
  } else if (authHeader?.startsWith('Bearer ')) {
    // Check if it's an authenticated user with admin/manager role
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (!userErr && user?.id) {
      const adminClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceRoleKey ?? '',
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: roles } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      if (roles?.some(r => r.role === 'admin' || r.role === 'manager')) {
        authMethod = 'user_jwt';
      }
    }
  }

  if (authMethod === 'none') {
    console.error('Unauthorized request');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`Auth method: ${authMethod}`);

  // Check for target_date in request body (for manual invocation)
  try {
    if (req.method === 'POST') {
      const body = await req.clone().json().catch(() => ({}));
      if (body.target_date) targetDate = body.target_date;
    }
  } catch {}

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      serviceRoleKey ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get target date (from body or Chicago timezone today)
    let todayStr: string;
    if (targetDate) {
      todayStr = targetDate;
    } else {
      const chicagoTime = new Date().toLocaleString("en-US", { timeZone: "America/Chicago" });
      const chicagoDate = new Date(chicagoTime);
      todayStr = chicagoDate.toISOString().split('T')[0];
    }

    console.log(`send-afterhours-sms: Chicago date=${todayStr}, auth=${authMethod}`);

    // Check if today is a scheduled afterhours day
    const { data: schedule, error: schedErr } = await supabaseAdmin
      .from('afterhours_schedule')
      .select('id')
      .eq('scheduled_date', todayStr)
      .limit(1);

    if (schedErr) throw schedErr;
    if (!schedule || schedule.length === 0) {
      console.log('No afterhours schedule for today, skipping');
      return new Response(JSON.stringify({ message: 'Not a scheduled day', date: todayStr }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get assignments for today with dispatcher and driver info
    const { data: assignments, error: assignErr } = await supabaseAdmin
      .from('afterhours_assignments')
      .select('afterhours_user_id, driver_id')
      .eq('scheduled_date', todayStr);

    if (assignErr) throw assignErr;

    console.log(`Assignments found: ${assignments?.length ?? 0}`);

    if (!assignments || assignments.length === 0) {
      console.log('No assignments for today');
      return new Response(JSON.stringify({ message: 'No assignments', date: todayStr }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get unique dispatcher IDs and driver IDs
    const dispatcherIds = [...new Set(assignments.map(a => a.afterhours_user_id))];
    const driverIds = [...new Set(assignments.map(a => a.driver_id))];

    // Fetch dispatcher profiles and driver phones in parallel
    const [profilesRes, driversRes] = await Promise.all([
      supabaseAdmin.from('profiles').select('user_id, full_name, phone_number').in('user_id', dispatcherIds),
      supabaseAdmin.from('drivers').select('id, phone, name').in('id', driverIds),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (driversRes.error) throw driversRes.error;

    const profileMap = new Map(profilesRes.data!.map(p => [p.user_id, p]));
    const driverMap = new Map(driversRes.data!.map(d => [d.id, d]));

    // RingCentral auth
    const CLIENT_ID = Deno.env.get('RINGCENTRAL_CLIENT_ID');
    const CLIENT_SECRET = Deno.env.get('RINGCENTRAL_CLIENT_SECRET');
    const JWT_TOKEN = Deno.env.get('RINGCENTRAL_JWT_TOKEN');
    const SERVER_URL = Deno.env.get('RINGCENTRAL_SERVER_URL') || 'https://platform.ringcentral.com';
    const FROM_NUMBER = Deno.env.get('RINGCENTRAL_PHONE_NUMBER');

    if (!CLIENT_ID || !CLIENT_SECRET || !JWT_TOKEN || !FROM_NUMBER) {
      throw new Error('Missing RingCentral credentials');
    }

    const authResponse = await fetch(`${SERVER_URL}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${JWT_TOKEN}`
    });

    if (!authResponse.ok) {
      const err = await authResponse.text();
      throw new Error(`RingCentral auth failed: ${err}`);
    }

    const { access_token } = await authResponse.json();
    console.log('RingCentral authenticated');

    // Helper: delay between messages to avoid RingCentral rate limits
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Helper: send SMS with retry on rate limit
    const sendSmsWithRetry = async (toNumber: string, message: string, driverName: string, retries = 3): Promise<{ status: string; driver: string; messageId?: string; error?: string }> => {
      for (let attempt = 0; attempt < retries; attempt++) {
        const smsResponse = await fetch(`${SERVER_URL}/restapi/v1.0/account/~/extension/~/sms`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: { phoneNumber: FROM_NUMBER },
            to: [{ phoneNumber: toNumber }],
            text: message
          })
        });

        if (smsResponse.ok) {
          const data = await smsResponse.json();
          console.log(`SMS sent for ${driverName}, id: ${data.id}`);
          return { driver: driverName, status: 'sent', messageId: data.id };
        }

        const err = await smsResponse.text();
        if (err.includes('CMN-301') && attempt < retries - 1) {
          const backoff = (attempt + 1) * 3000;
          console.log(`Rate limited for ${driverName}, retrying in ${backoff}ms (attempt ${attempt + 1}/${retries})`);
          await delay(backoff);
          continue;
        }

        console.error(`SMS failed for ${driverName}:`, err);
        return { driver: driverName, status: 'failed', error: err };
      }
      return { driver: driverName, status: 'failed', error: 'Max retries exceeded' };
    };

    // Send SMS for each assignment with 1.5s spacing
    const results = [];
    for (const assignment of assignments) {
      const dispatcher = profileMap.get(assignment.afterhours_user_id);
      const driver = driverMap.get(assignment.driver_id);

      if (!dispatcher?.full_name || !dispatcher?.phone_number) {
        console.log(`Skipping: dispatcher ${assignment.afterhours_user_id} missing name/phone`);
        results.push({ driver: driver?.name, status: 'skipped', reason: 'dispatcher missing info' });
        continue;
      }

      if (!driver?.phone) {
        console.log(`Skipping: driver ${driver?.name} has no phone`);
        results.push({ driver: driver?.name, status: 'skipped', reason: 'driver no phone' });
        continue;
      }

      // Extract nickname (part after hyphen in last word)
      const nameParts = dispatcher.full_name.trim().split(/\s+/);
      const lastWord = nameParts[nameParts.length - 1];
      const lastName = lastWord.includes('-') ? lastWord.split('-').pop()! : lastWord;

      // Strip +1 prefix from dispatcher phone for message
      const dispatcherPhone = dispatcher.phone_number.replace(/^\+1\s?/, '');

      const message = `Good morning, your dispatcher for today will be ${lastName}, you can contact him directly via this number ${dispatcherPhone}`;

      const toNumber = driver.phone;
      console.log(`Sending SMS to ${toNumber} (driver: ${driver.name})`);

      const result = await sendSmsWithRetry(toNumber, message, driver.name);
      results.push(result);

      // Wait 1.5s between messages
      if (results.length < assignments.length) {
        await delay(1500);
      }
    }

    console.log(`SMS results: ${results.filter(r => r.status === 'sent').length} sent, ${results.filter(r => r.status === 'skipped').length} skipped, ${results.filter(r => r.status === 'failed').length} failed`);

    return new Response(JSON.stringify({ success: true, date: todayStr, authMethod, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

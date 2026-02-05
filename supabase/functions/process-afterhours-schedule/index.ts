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

    console.log(`Processing afterhours schedule - Chicago time: ${chicagoTime}, hour: ${currentHour}, date: ${todayStr}`);

    // Get the action type from query params or determine based on time
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    
    let scheduleAction: 'start' | 'end' | null = null;
    
    if (action === 'start' || action === 'end') {
      scheduleAction = action;
    } else {
      // Auto-determine based on Chicago time
      // 6am = start afterhours, 5pm (17:00) = end afterhours
      if (currentHour === 6) {
        scheduleAction = 'start';
      } else if (currentHour === 17) {
        scheduleAction = 'end';
      }
    }

    if (!scheduleAction) {
      console.log('No action needed at this time');
      return new Response(
        JSON.stringify({ message: 'No action needed at this time', hour: currentHour }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get scheduled users for today
    const { data: scheduledUsers, error: fetchError } = await supabaseAdmin
      .from('afterhours_schedule')
      .select('user_id')
      .eq('scheduled_date', todayStr);

    if (fetchError) {
      console.error('Error fetching schedule:', fetchError);
      throw fetchError;
    }

    if (!scheduledUsers || scheduledUsers.length === 0) {
      console.log('No users scheduled for today');
      return new Response(
        JSON.stringify({ message: 'No users scheduled for today', date: todayStr }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${scheduledUsers.length} scheduled users for ${todayStr}`);

    const results = [];

    for (const scheduled of scheduledUsers) {
      const userId = scheduled.user_id;

      if (scheduleAction === 'start') {
        // Change role from dispatch to afterhours
        // First check if user has dispatch role
        const { data: hasDispatch } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .eq('role', 'dispatch')
          .single();

        if (hasDispatch) {
          // Delete dispatch role
          await supabaseAdmin
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .eq('role', 'dispatch');

          // Add afterhours role
          await supabaseAdmin
            .from('user_roles')
            .insert({ user_id: userId, role: 'afterhours' });

          console.log(`User ${userId}: Changed from dispatch to afterhours`);
          results.push({ userId, action: 'dispatch -> afterhours' });
        } else {
          console.log(`User ${userId}: No dispatch role found, skipping`);
          results.push({ userId, action: 'skipped - no dispatch role' });
        }
      } else if (scheduleAction === 'end') {
        // Change role from afterhours back to dispatch
        const { data: hasAfterhours } = await supabaseAdmin
          .from('user_roles')
          .select('id')
          .eq('user_id', userId)
          .eq('role', 'afterhours')
          .single();

        if (hasAfterhours) {
          // Delete afterhours role
          await supabaseAdmin
            .from('user_roles')
            .delete()
            .eq('user_id', userId)
            .eq('role', 'afterhours');

          // Add dispatch role back
          await supabaseAdmin
            .from('user_roles')
            .insert({ user_id: userId, role: 'dispatch' });

          console.log(`User ${userId}: Changed from afterhours to dispatch`);
          results.push({ userId, action: 'afterhours -> dispatch' });
        } else {
          console.log(`User ${userId}: No afterhours role found, skipping`);
          results.push({ userId, action: 'skipped - no afterhours role' });
        }

        // Note: We no longer delete old schedule entries to preserve history
        // Historical records are kept for reference
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        action: scheduleAction,
        date: todayStr,
        processedUsers: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-afterhours-schedule:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

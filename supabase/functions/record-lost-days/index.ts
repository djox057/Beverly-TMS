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

    // Helper function to check if a date is a weekday (Mon-Fri)
    const isWeekday = (date: Date): boolean => {
      const day = date.getDay();
      return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
    };

    // Helper function to get observed holiday date (Sat -> Fri, Sun -> Mon)
    const getObservedDate = (year: number, month: number, day: number): Date => {
      const actual = new Date(year, month, day);
      const dayOfWeek = actual.getDay();
      if (dayOfWeek === 6) return new Date(year, month, day - 1); // Saturday -> Friday
      if (dayOfWeek === 0) return new Date(year, month, day + 1); // Sunday -> Monday
      return actual;
    };

    // Helper function to get Nth weekday of a month (for moving holidays)
    const getNthWeekdayOfMonth = (year: number, month: number, weekday: number, n: number): Date => {
      let count = 0;
      for (let day = 1; day <= 31; day++) {
        const d = new Date(year, month, day);
        if (d.getMonth() !== month) break;
        if (d.getDay() === weekday) {
          count++;
          if (count === n) return d;
        }
      }
      return new Date(year, month, 1);
    };

    // Helper function to get last weekday of a month (for Memorial Day)
    const getLastWeekdayOfMonth = (year: number, month: number, weekday: number): Date => {
      const lastDay = new Date(year, month + 1, 0).getDate();
      for (let day = lastDay; day >= 1; day--) {
        const d = new Date(year, month, day);
        if (d.getDay() === weekday) return d;
      }
      return new Date(year, month, 1);
    };

    // Helper function to check if a date is a holiday
    const isHoliday = (date: Date): boolean => {
      const year = date.getFullYear();
      const month = date.getMonth();
      const day = date.getDate();

      // Fixed holidays (with observed dates for weekends)
      const fixedHolidays = [
        { month: 0, day: 1 },   // New Year's Day
        { month: 5, day: 19 },  // Juneteenth
        { month: 6, day: 4 },   // Independence Day
        { month: 10, day: 11 }, // Veterans Day
        { month: 11, day: 25 }, // Christmas Day
      ];

      for (const h of fixedHolidays) {
        const observed = getObservedDate(year, h.month, h.day);
        if (observed.getMonth() === month && observed.getDate() === day) {
          return true;
        }
      }

      // Moving holidays
      // MLK Day: 3rd Monday of January
      const mlkDay = getNthWeekdayOfMonth(year, 0, 1, 3);
      if (month === mlkDay.getMonth() && day === mlkDay.getDate()) return true;

      // Presidents Day: 3rd Monday of February
      const presidentsDay = getNthWeekdayOfMonth(year, 1, 1, 3);
      if (month === presidentsDay.getMonth() && day === presidentsDay.getDate()) return true;

      // Memorial Day: Last Monday of May
      const memorialDay = getLastWeekdayOfMonth(year, 4, 1);
      if (month === memorialDay.getMonth() && day === memorialDay.getDate()) return true;

      // Labor Day: 1st Monday of September
      const laborDay = getNthWeekdayOfMonth(year, 8, 1, 1);
      if (month === laborDay.getMonth() && day === laborDay.getDate()) return true;

      // Thanksgiving: 4th Thursday of November
      const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4);
      if (month === thanksgiving.getMonth() && day === thanksgiving.getDate()) return true;

      return false;
    };

    // Helper function to check if a date is a working day
    const isWorkingDay = (date: Date): boolean => {
      return isWeekday(date) && !isHoliday(date);
    };

    // Check if today is a working day
    if (!isWorkingDay(chicagoDate)) {
      console.log(`${todayStr} is not a working day (weekend or holiday), skipping lost day recording`);
      return new Response(
        JSON.stringify({ 
          message: 'Not a working day (weekend or holiday), skipping', 
          date: todayStr,
          isWeekday: isWeekday(chicagoDate),
          isHoliday: isHoliday(chicagoDate)
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Recording lost days - Chicago time: ${chicagoTime}, hour: ${currentHour}, date: ${todayStr}`);

    // Allow force override via query param
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === 'true';

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

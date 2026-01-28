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

    // Get all active drivers with their truck assignments
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select('dispatcher_id, id')
      .eq('is_active', true)
      .not('dispatcher_id', 'is', null);

    if (driversError) {
      console.error('Error fetching drivers:', driversError);
      throw driversError;
    }

    // Get all trucks to determine unique truck counts per dispatcher
    const { data: trucks, error: trucksError } = await supabase
      .from('trucks')
      .select('id, driver1_id, driver2_id');

    if (trucksError) {
      console.error('Error fetching trucks:', trucksError);
      throw trucksError;
    }

    // Count unique trucks per dispatcher
    const dispatcherTruckSets = new Map<string, Set<string>>();
    
    // For each truck, add it to the set of the dispatcher(s) of its driver(s)
    trucks?.forEach((truck) => {
      // Check driver1
      if (truck.driver1_id) {
        const driver1 = drivers?.find(d => d.id === truck.driver1_id);
        if (driver1?.dispatcher_id) {
          if (!dispatcherTruckSets.has(driver1.dispatcher_id)) {
            dispatcherTruckSets.set(driver1.dispatcher_id, new Set());
          }
          dispatcherTruckSets.get(driver1.dispatcher_id)!.add(truck.id);
        }
      }
      // Check driver2 (if exists, should use same dispatcher as driver1)
      if (truck.driver2_id) {
        const driver2 = drivers?.find(d => d.id === truck.driver2_id);
        if (driver2?.dispatcher_id) {
          if (!dispatcherTruckSets.has(driver2.dispatcher_id)) {
            dispatcherTruckSets.set(driver2.dispatcher_id, new Set());
          }
          dispatcherTruckSets.get(driver2.dispatcher_id)!.add(truck.id);
        }
      }
    });

    // Count drivers per dispatcher
    const dispatcherDriverCounts = new Map<string, number>();
    drivers?.forEach((driver) => {
      if (driver.dispatcher_id) {
        const current = dispatcherDriverCounts.get(driver.dispatcher_id) || 0;
        dispatcherDriverCounts.set(driver.dispatcher_id, current + 1);
      }
    });

    // Get all unique dispatcher IDs
    const allDispatcherIds = new Set([
      ...dispatcherTruckSets.keys(),
      ...dispatcherDriverCounts.keys(),
    ]);

    console.log(`Found ${allDispatcherIds.size} dispatchers with trucks/drivers`);

    // Insert or update counts for each dispatcher
    const results = [];
    for (const dispatcherId of allDispatcherIds) {
      const truckCount = dispatcherTruckSets.get(dispatcherId)?.size || 0;
      const driverCount = dispatcherDriverCounts.get(dispatcherId) || 0;
      
      const { data, error } = await supabase
        .from('dispatcher_daily_driver_counts')
        .upsert({
          dispatcher_id: dispatcherId,
          date: today,
          truck_count: truckCount,
          driver_count: driverCount,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'dispatcher_id,date',
        })
        .select()
        .single();

      if (error) {
        console.error(`Error recording count for dispatcher ${dispatcherId}:`, error);
      } else {
        console.log(`Recorded ${truckCount} trucks, ${driverCount} drivers for dispatcher ${dispatcherId}`);
        results.push({ dispatcher_id: dispatcherId, truck_count: truckCount, driver_count: driverCount });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: today,
        recorded_counts: results,
        message: `Recorded truck counts for ${results.length} dispatchers`,
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

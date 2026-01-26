import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderRow {
  id: string;
  booked_by: string | null;
  freight_amount: number | null;
  detention: number | null;
  layover: number | null;
  tonu: number | null;
  extra_stop: number | null;
  escort_fee: number | null;
  other_additionals: number | null;
  late_fee: number | null;
  no_tracking_fee: number | null;
  driver_price: number | null;
  tonu_driver: number | null;
  mileage: number | null;
  driver1_id: string | null;
  pickup_datetime: string | null;
  delivery_datetime: string | null;
  canceled: boolean | null;
}

interface DispatcherAggregate {
  dispatcher_id: string;
  dispatcher_name: string;
  office: string | null;
  total_freight: number;
  total_driver_rate: number;
  total_miles: number;
  order_count: number;
}

// Calculate totalFreightAmountNoLumper (same as ordersTransform.ts)
function calculateTotalFreight(order: OrderRow): number {
  const toNum = (val: any) => Number(val) || 0;
  return (
    toNum(order.freight_amount) +
    toNum(order.detention) +
    toNum(order.layover) +
    toNum(order.tonu) +
    toNum(order.extra_stop) +
    toNum(order.escort_fee) +
    toNum(order.other_additionals) -
    toNum(order.late_fee) -
    toNum(order.no_tracking_fee)
  );
}

// Calculate driver pay (respecting company driver logic)
function calculateDriverPay(order: OrderRow, companyDriverIds: Set<string>): number {
  const toNum = (val: any) => Number(val) || 0;
  
  // For company drivers, driver pay equals total freight (0% cut)
  if (order.driver1_id && companyDriverIds.has(order.driver1_id)) {
    return calculateTotalFreight(order);
  }
  
  return toNum(order.driver_price) + toNum(order.tonu_driver);
}

// Get Monday of the week for a given date
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Get first day of month
function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Get last day of month
function getMonthEnd(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json().catch(() => ({}));
    const { period_type = 'week', period_start, force_recalc = false } = body;

    console.log(`[calculate-analytics] Starting calculation for ${period_type}, start: ${period_start}`);

    // Determine period bounds
    let periodStartDate: Date;
    let periodEndDate: Date;

    if (period_start) {
      periodStartDate = new Date(period_start);
    } else {
      // Default: current week/month
      periodStartDate = period_type === 'week' ? getWeekStart(new Date()) : getMonthStart(new Date());
    }

    if (period_type === 'week') {
      periodEndDate = new Date(periodStartDate);
      periodEndDate.setDate(periodEndDate.getDate() + 6);
    } else {
      periodEndDate = getMonthEnd(periodStartDate);
    }

    const periodStartStr = periodStartDate.toISOString().split('T')[0];
    const periodEndStr = periodEndDate.toISOString().split('T')[0];

    console.log(`[calculate-analytics] Period: ${periodStartStr} to ${periodEndStr}`);

    // Check if calculation is already done recently (within 5 minutes) unless force_recalc
    if (!force_recalc) {
      const { data: existingCalc } = await supabase
        .from('analytics_calculation_log')
        .select('*')
        .eq('period_type', period_type)
        .eq('period_start', periodStartStr)
        .eq('status', 'completed')
        .gte('completed_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .maybeSingle();

      if (existingCalc) {
        console.log(`[calculate-analytics] Recent calculation exists, skipping`);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Recent calculation exists',
          cached: true 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    // Log calculation start
    const { data: logEntry, error: logError } = await supabase
      .from('analytics_calculation_log')
      .insert({
        period_type,
        period_start: periodStartStr,
        status: 'calculating',
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (logError) {
      console.error('[calculate-analytics] Failed to create log entry:', logError);
    }

    // Fetch company drivers for driver pay calculation
    const { data: companyDrivers } = await supabase
      .from('drivers')
      .select('id')
      .eq('is_company_driver', true);

    const companyDriverIds = new Set((companyDrivers || []).map(d => d.id));
    console.log(`[calculate-analytics] Found ${companyDriverIds.size} company drivers`);

    // Fetch profiles for dispatcher info
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, office');

    const profilesByName: Record<string, { user_id: string; office: string | null }> = {};
    const profilesById: Record<string, { full_name: string; office: string | null }> = {};
    
    (profiles || []).forEach(p => {
      if (p.full_name) {
        profilesByName[p.full_name] = { user_id: p.user_id, office: p.office };
      }
      if (p.user_id) {
        profilesById[p.user_id] = { full_name: p.full_name || p.user_id, office: p.office };
      }
    });

    // Fetch dispatcher truck counts for avg_trucks calculation
    const { data: truckCounts } = await supabase
      .from('dispatcher_daily_driver_counts')
      .select('dispatcher_id, driver_count')
      .gte('date', periodStartStr)
      .lte('date', periodEndStr);

    const truckCountsByDispatcher: Record<string, { total: number; days: number }> = {};
    (truckCounts || []).forEach(tc => {
      if (!truckCountsByDispatcher[tc.dispatcher_id]) {
        truckCountsByDispatcher[tc.dispatcher_id] = { total: 0, days: 0 };
      }
      truckCountsByDispatcher[tc.dispatcher_id].total += tc.driver_count;
      truckCountsByDispatcher[tc.dispatcher_id].days += 1;
    });

    // Fetch orders from DATABASE ONLY (no archive)
    // Use delivery_datetime for month filters, pickup_datetime for week filters
    const dateField = period_type === 'month' ? 'delivery_datetime' : 'pickup_datetime';
    
    let ordersQuery = supabase
      .from('orders')
      .select(`
        id,
        booked_by,
        freight_amount,
        detention,
        layover,
        tonu,
        extra_stop,
        escort_fee,
        other_additionals,
        late_fee,
        no_tracking_fee,
        driver_price,
        tonu_driver,
        mileage,
        driver1_id,
        pickup_datetime,
        delivery_datetime,
        canceled
      `)
      .eq('locked', false)
      .gte(dateField, periodStartStr)
      .lte(dateField, periodEndStr + 'T23:59:59');

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error('[calculate-analytics] Failed to fetch orders:', ordersError);
      throw ordersError;
    }

    console.log(`[calculate-analytics] Fetched ${orders?.length || 0} orders`);

    // Aggregate by dispatcher
    const dispatcherAggregates: Record<string, DispatcherAggregate> = {};
    const officeAggregates: Record<string, { total_freight: number; total_driver_rate: number; total_miles: number; order_count: number }> = {};
    let globalAggregate = { total_freight: 0, total_driver_rate: 0, total_miles: 0, order_count: 0 };

    (orders || []).forEach((order: OrderRow) => {
      // Exclude canceled orders unless they have TONU
      if (order.canceled && !((order.tonu || 0) > 0 || (order.tonu_driver || 0) > 0)) {
        return;
      }

      const bookedBy = order.booked_by || 'Unknown';
      
      // Resolve dispatcher_id and office
      let dispatcherId: string;
      let office: string | null = null;
      
      // Check if booked_by is a UUID (user_id format) or name
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(bookedBy)) {
        dispatcherId = bookedBy;
        const profile = profilesById[bookedBy];
        office = profile?.office || null;
      } else {
        const profile = profilesByName[bookedBy];
        dispatcherId = profile?.user_id || bookedBy;
        office = profile?.office || null;
      }

      if (!dispatcherAggregates[dispatcherId]) {
        dispatcherAggregates[dispatcherId] = {
          dispatcher_id: dispatcherId,
          dispatcher_name: profilesById[dispatcherId]?.full_name || bookedBy,
          office,
          total_freight: 0,
          total_driver_rate: 0,
          total_miles: 0,
          order_count: 0
        };
      }

      const totalFreight = calculateTotalFreight(order);
      const driverPay = calculateDriverPay(order, companyDriverIds);
      const mileage = Number(order.mileage) || 0;

      dispatcherAggregates[dispatcherId].total_freight += totalFreight;
      dispatcherAggregates[dispatcherId].total_driver_rate += driverPay;
      dispatcherAggregates[dispatcherId].total_miles += mileage;
      dispatcherAggregates[dispatcherId].order_count += 1;

      // Office aggregates
      const officeKey = office || 'Unknown';
      if (!officeAggregates[officeKey]) {
        officeAggregates[officeKey] = { total_freight: 0, total_driver_rate: 0, total_miles: 0, order_count: 0 };
      }
      officeAggregates[officeKey].total_freight += totalFreight;
      officeAggregates[officeKey].total_driver_rate += driverPay;
      officeAggregates[officeKey].total_miles += mileage;
      officeAggregates[officeKey].order_count += 1;

      // Global aggregate
      globalAggregate.total_freight += totalFreight;
      globalAggregate.total_driver_rate += driverPay;
      globalAggregate.total_miles += mileage;
      globalAggregate.order_count += 1;
    });

    console.log(`[calculate-analytics] Aggregated ${Object.keys(dispatcherAggregates).length} dispatchers`);

    // Upsert dispatcher period aggregates
    const dispatcherRows = Object.values(dispatcherAggregates).map(agg => {
      const cut = agg.total_freight - agg.total_driver_rate;
      const cutPercent = agg.total_freight > 0 ? (cut / agg.total_freight) * 100 : 0;
      const ratePerMile = agg.total_miles > 0 ? agg.total_freight / agg.total_miles : 0;
      
      // Calculate avg trucks from dispatcher_daily_driver_counts
      const truckData = truckCountsByDispatcher[agg.dispatcher_id];
      const avgTrucks = truckData && truckData.days > 0 ? truckData.total / truckData.days : 0;

      return {
        dispatcher_id: agg.dispatcher_id,
        dispatcher_name: agg.dispatcher_name,
        office: agg.office,
        period_type,
        period_start: periodStartStr,
        period_end: periodEndStr,
        total_freight: agg.total_freight,
        total_driver_rate: agg.total_driver_rate,
        dispatcher_cut: cut,
        dispatcher_cut_percent: cutPercent,
        total_miles: agg.total_miles,
        rate_per_mile: ratePerMile,
        order_count: agg.order_count,
        avg_trucks: avgTrucks,
        last_calculated_at: new Date().toISOString()
      };
    });

    if (dispatcherRows.length > 0) {
      const { error: upsertError } = await supabase
        .from('analytics_dispatcher_period')
        .upsert(dispatcherRows, { 
          onConflict: 'dispatcher_id,period_type,period_start',
          ignoreDuplicates: false 
        });

      if (upsertError) {
        console.error('[calculate-analytics] Failed to upsert dispatcher analytics:', upsertError);
        throw upsertError;
      }
    }

    // Upsert period totals (global + per office)
    // FIX: Filter out "Unknown" office to prevent duplicate null rows
    const validOfficeAggregates = Object.entries(officeAggregates)
      .filter(([office]) => office !== 'Unknown');

    const totalRows = [
      // Global total (office = null) - includes all orders including "Unknown" office
      {
        period_type,
        period_start: periodStartStr,
        period_end: periodEndStr,
        office: null as string | null,
        total_freight: globalAggregate.total_freight,
        total_driver_rate: globalAggregate.total_driver_rate,
        total_cut: globalAggregate.total_freight - globalAggregate.total_driver_rate,
        total_cut_percent: globalAggregate.total_freight > 0 
          ? ((globalAggregate.total_freight - globalAggregate.total_driver_rate) / globalAggregate.total_freight) * 100 
          : 0,
        total_miles: globalAggregate.total_miles,
        rate_per_mile: globalAggregate.total_miles > 0 ? globalAggregate.total_freight / globalAggregate.total_miles : 0,
        order_count: globalAggregate.order_count,
        last_calculated_at: new Date().toISOString()
      },
      // Per-office totals (excluding "Unknown" which is already in global)
      ...validOfficeAggregates.map(([office, agg]) => ({
        period_type,
        period_start: periodStartStr,
        period_end: periodEndStr,
        office, // Never null here since we filtered out Unknown
        total_freight: agg.total_freight,
        total_driver_rate: agg.total_driver_rate,
        total_cut: agg.total_freight - agg.total_driver_rate,
        total_cut_percent: agg.total_freight > 0 ? ((agg.total_freight - agg.total_driver_rate) / agg.total_freight) * 100 : 0,
        total_miles: agg.total_miles,
        rate_per_mile: agg.total_miles > 0 ? agg.total_freight / agg.total_miles : 0,
        order_count: agg.order_count,
        last_calculated_at: new Date().toISOString()
      }))
    ];

    const { error: totalsError } = await supabase
      .from('analytics_period_totals')
      .upsert(totalRows, { 
        onConflict: 'period_type,period_start,office',
        ignoreDuplicates: false 
      });

    if (totalsError) {
      console.error('[calculate-analytics] Failed to upsert period totals:', totalsError);
      throw totalsError;
    }

    // Update calculation log
    if (logEntry?.id) {
      await supabase
        .from('analytics_calculation_log')
        .update({
          status: 'completed',
          orders_processed: orders?.length || 0,
          completed_at: new Date().toISOString()
        })
        .eq('id', logEntry.id);
    }

    console.log(`[calculate-analytics] Completed successfully`);

    return new Response(JSON.stringify({
      success: true,
      period_type,
      period_start: periodStartStr,
      period_end: periodEndStr,
      dispatchers_processed: dispatcherRows.length,
      orders_processed: orders?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[calculate-analytics] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

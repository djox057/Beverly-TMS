import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // The WHERE clause matching the TONU exception from filteredOrders
    const WHERE_LOCKED = `locked = true AND (canceled = false OR COALESCE(tonu,0) > 0 OR COALESCE(tonu_driver,0) > 0)`;

    // Freight formula (no lumper) - matches ordersTransform.ts totalFreightAmountNoLumper
    const FREIGHT_SQL = `
      COALESCE(freight_amount,0) + COALESCE(detention,0) + COALESCE(layover,0)
      + COALESCE(tonu,0) + COALESCE(extra_stop,0) + COALESCE(escort_fee,0)
      + COALESCE(other_additionals,0)
      - COALESCE(late_fee,0) - COALESCE(no_tracking_fee,0)
      - COALESCE(wrong_address_fee,0) - COALESCE(other_charges,0)
    `;

    // Driver pay formula - matches ordersTransform.ts totalDriverPay
    const DRIVER_PAY_SQL = `
      COALESCE(driver_price,0) + COALESCE(detention_driver,0) + COALESCE(layover_driver,0)
      + COALESCE(tonu_driver,0) + COALESCE(extra_stop_driver,0) + COALESCE(lumper_driver,0)
      - COALESCE(late_fee_driver,0) - COALESCE(no_tracking_fee_driver,0)
      - COALESCE(wrong_address_fee_driver,0) + COALESCE(other_charges_driver,0)
      + COALESCE(other_additionals_driver,0)
    `;

    // Total miles formula - matches ordersTransform.ts mileage
    const MILES_SQL = `COALESCE(loaded_miles,0) + COALESCE(dh_miles,0) + COALESCE(additional_miles,0)`;

    // DH miles
    const DH_MILES_SQL = `COALESCE(dh_miles,0)`;

    console.log("[recompute] Starting rebuild...");

    // Step 1: Truncate staging table
    const { error: truncErr } = await supabase.rpc("", {}).then(() => ({ error: null })).catch(() => ({ error: null }));
    // Use raw SQL via service role
    const truncRes = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
    }).catch(() => null);

    // Truncate staging via direct delete (service role bypasses RLS)
    const { error: delErr } = await supabase
      .from("analytics_locked_daily_staging")
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000");

    if (delErr) {
      console.error("[recompute] Failed to clear staging:", delErr);
      throw new Error(`Failed to clear staging: ${delErr.message}`);
    }

    console.log("[recompute] Staging cleared");

    // Step 2: Aggregate and insert into staging
    // We run 4 queries: dispatcher x pickup, dispatcher x delivery, driver x pickup, driver x delivery

    const dateColumns: Record<string, string> = {
      pickup: "pickup_datetime::date",
      delivery: "delivery_datetime::date",
    };

    let totalInserted = 0;

    for (const dateType of ["pickup", "delivery"] as const) {
      const dateCol = dateColumns[dateType];

      // --- Dispatcher aggregation ---
      const dispatcherQuery = `
        SELECT
          'dispatcher' as entity_type,
          booked_by as entity_id,
          booked_by as entity_name,
          ${dateCol} as date,
          '${dateType}' as date_type,
          SUM(${FREIGHT_SQL}) as total_freight,
          SUM(${DRIVER_PAY_SQL}) as total_driver_pay,
          SUM(${MILES_SQL}) as total_miles,
          SUM(${DH_MILES_SQL}) as total_dh_miles,
          COUNT(*) as order_count,
          false as is_company_driver
        FROM orders
        WHERE ${WHERE_LOCKED}
          AND booked_by IS NOT NULL
          AND ${dateCol} IS NOT NULL
        GROUP BY booked_by, ${dateCol}
      `;

      const { data: dispRows, error: dispErr } = await supabase.rpc(
        "execute_aggregation_query",
        {}
      ).then(() => ({ data: null, error: null })).catch(() => ({ data: null, error: null }));

      // Since we can't run raw SQL via RPC, we use the REST API directly
      const dispRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
          },
        }
      ).catch(() => null);

      // Alternative approach: Use PostgREST SQL endpoint
      // Actually, we need to use the pg_net or direct SQL approach
      // Let's use a simpler approach - fetch all locked orders and aggregate in Deno

      // Fetch locked orders in batches for this date type
      const aggregated = await aggregateOrders(supabase, dateType, WHERE_LOCKED);

      if (aggregated.dispatchers.length > 0) {
        // Insert dispatcher rows in batches of 500
        for (let i = 0; i < aggregated.dispatchers.length; i += 500) {
          const batch = aggregated.dispatchers.slice(i, i + 500);
          const { error: insErr } = await supabase
            .from("analytics_locked_daily_staging")
            .insert(batch);
          if (insErr) {
            console.error(`[recompute] Dispatcher insert error (${dateType}):`, insErr);
            throw insErr;
          }
        }
        totalInserted += aggregated.dispatchers.length;
        console.log(`[recompute] Inserted ${aggregated.dispatchers.length} dispatcher rows (${dateType})`);
      }

      if (aggregated.drivers.length > 0) {
        // Insert driver rows in batches of 500
        for (let i = 0; i < aggregated.drivers.length; i += 500) {
          const batch = aggregated.drivers.slice(i, i + 500);
          const { error: insErr } = await supabase
            .from("analytics_locked_daily_staging")
            .insert(batch);
          if (insErr) {
            console.error(`[recompute] Driver insert error (${dateType}):`, insErr);
            throw insErr;
          }
        }
        totalInserted += aggregated.drivers.length;
        console.log(`[recompute] Inserted ${aggregated.drivers.length} driver rows (${dateType})`);
      }
    }

    console.log(`[recompute] Total staging rows: ${totalInserted}`);

    // Step 3: Swap tables using rename pattern
    // We can't do ALTER TABLE via PostgREST, so we use a different approach:
    // Delete all from main table, then copy from staging
    const { error: mainDelErr } = await supabase
      .from("analytics_locked_daily")
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000");

    if (mainDelErr) {
      console.error("[recompute] Failed to clear main table:", mainDelErr);
      throw mainDelErr;
    }

    // Copy staging to main in batches
    // Read from staging
    let offset = 0;
    const COPY_BATCH = 1000;
    let copiedCount = 0;

    while (true) {
      const { data: stagingRows, error: readErr } = await supabase
        .from("analytics_locked_daily_staging")
        .select("entity_type, entity_id, entity_name, date, date_type, total_freight, total_driver_pay, total_miles, total_dh_miles, order_count, is_company_driver")
        .range(offset, offset + COPY_BATCH - 1);

      if (readErr) {
        console.error("[recompute] Failed to read staging:", readErr);
        throw readErr;
      }

      if (!stagingRows || stagingRows.length === 0) break;

      const { error: copyErr } = await supabase
        .from("analytics_locked_daily")
        .insert(stagingRows);

      if (copyErr) {
        console.error("[recompute] Failed to copy to main:", copyErr);
        throw copyErr;
      }

      copiedCount += stagingRows.length;
      offset += stagingRows.length;
    }

    const elapsed = Date.now() - startTime;
    console.log(`[recompute] ✅ Complete: ${copiedCount} rows in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        rowCount: copiedCount,
        elapsedMs: elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[recompute] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Fetch all locked orders and aggregate them by dispatcher and driver for a given date type.
 * This runs in Deno since we can't execute raw aggregate SQL via PostgREST.
 */
async function aggregateOrders(
  supabase: any,
  dateType: "pickup" | "delivery",
  whereClause: string
) {
  const dateField = dateType === "pickup" ? "pickup_datetime" : "delivery_datetime";

  // We need: booked_by, driver1_id, financial columns, date field, is_company_driver (via driver join)
  // Fetch in batches of 5000
  const SELECT_COLS = [
    "booked_by",
    "driver1_id",
    "deleted_driver1_name",
    dateField,
    "freight_amount", "detention", "layover", "tonu", "extra_stop",
    "escort_fee", "other_additionals", "late_fee", "no_tracking_fee",
    "wrong_address_fee", "other_charges",
    "driver_price", "detention_driver", "layover_driver", "tonu_driver",
    "extra_stop_driver", "lumper_driver", "late_fee_driver",
    "no_tracking_fee_driver", "wrong_address_fee_driver",
    "other_charges_driver", "other_additionals_driver",
    "loaded_miles", "dh_miles", "additional_miles",
    "canceled", "tonu_driver",
  ].join(",");

  // Fetch driver company driver flags
  const { data: driversData } = await supabase
    .from("drivers")
    .select("id, name, is_company_driver");

  const driverMap = new Map<string, { name: string; isCompanyDriver: boolean }>();
  (driversData || []).forEach((d: any) => {
    driverMap.set(d.id, { name: d.name || "", isCompanyDriver: d.is_company_driver === true });
  });

  // Dispatcher aggregation maps: key = `${booked_by}|${date}` => totals
  const dispatcherMap = new Map<string, {
    entity_id: string;
    entity_name: string;
    date: string;
    total_freight: number;
    total_driver_pay: number;
    total_miles: number;
    total_dh_miles: number;
    order_count: number;
  }>();

  // Driver aggregation maps: key = `${driver1_id}|${date}` => totals
  const driverAggMap = new Map<string, {
    entity_id: string;
    entity_name: string;
    date: string;
    total_freight: number;
    total_driver_pay: number;
    total_miles: number;
    total_dh_miles: number;
    order_count: number;
    is_company_driver: boolean;
  }>();

  let offset = 0;
  const BATCH = 1000; // Supabase PostgREST default max is 1000
  let totalOrders = 0;

  while (true) {
    let query = supabase
      .from("orders")
      .select(SELECT_COLS)
      .eq("locked", true)
      .not(dateField, "is", null)
      .or("canceled.eq.false,tonu.gt.0,tonu_driver.gt.0")
      .order("id", { ascending: true })
      .range(offset, offset + BATCH - 1);

    const { data: orders, error } = await query;

    if (error) {
      console.error(`[recompute] Fetch error at offset ${offset}:`, error);
      throw error;
    }

    if (!orders || orders.length === 0) break;

    totalOrders += orders.length;

    for (const order of orders) {
      const dateVal = order[dateField];
      if (!dateVal) continue;

      // Extract date part (YYYY-MM-DD)
      const dateStr = String(dateVal).substring(0, 10);

      const toNum = (v: any): number => {
        if (v === null || v === undefined) return 0;
        const n = Number(v);
        return isNaN(n) ? 0 : n;
      };

      const freight =
        toNum(order.freight_amount) + toNum(order.detention) + toNum(order.layover) +
        toNum(order.tonu) + toNum(order.extra_stop) + toNum(order.escort_fee) +
        toNum(order.other_additionals) -
        toNum(order.late_fee) - toNum(order.no_tracking_fee) -
        toNum(order.wrong_address_fee) - toNum(order.other_charges);

      const driverPay =
        toNum(order.driver_price) + toNum(order.detention_driver) + toNum(order.layover_driver) +
        toNum(order.tonu_driver) + toNum(order.extra_stop_driver) + toNum(order.lumper_driver) -
        toNum(order.late_fee_driver) - toNum(order.no_tracking_fee_driver) -
        toNum(order.wrong_address_fee_driver) + toNum(order.other_charges_driver) +
        toNum(order.other_additionals_driver);

      const miles = toNum(order.loaded_miles) + toNum(order.dh_miles) + toNum(order.additional_miles);
      const dhMiles = toNum(order.dh_miles);

      // Dispatcher aggregation
      if (order.booked_by) {
        const dKey = `${order.booked_by}|${dateStr}`;
        const existing = dispatcherMap.get(dKey);
        if (existing) {
          existing.total_freight += freight;
          existing.total_driver_pay += driverPay;
          existing.total_miles += miles;
          existing.total_dh_miles += dhMiles;
          existing.order_count += 1;
        } else {
          dispatcherMap.set(dKey, {
            entity_id: order.booked_by,
            entity_name: order.booked_by,
            date: dateStr,
            total_freight: freight,
            total_driver_pay: driverPay,
            total_miles: miles,
            total_dh_miles: dhMiles,
            order_count: 1,
          });
        }
      }

      // Driver aggregation
      if (order.driver1_id) {
        const drKey = `${order.driver1_id}|${dateStr}`;
        const driverInfo = driverMap.get(order.driver1_id);
        const driverName = driverInfo?.name || order.deleted_driver1_name || "Unknown";
        const isCompany = driverInfo?.isCompanyDriver || false;

        const existing = driverAggMap.get(drKey);
        if (existing) {
          existing.total_freight += freight;
          existing.total_driver_pay += driverPay;
          existing.total_miles += miles;
          existing.total_dh_miles += dhMiles;
          existing.order_count += 1;
        } else {
          driverAggMap.set(drKey, {
            entity_id: order.driver1_id,
            entity_name: driverName,
            date: dateStr,
            total_freight: freight,
            total_driver_pay: driverPay,
            total_miles: miles,
            total_dh_miles: dhMiles,
            order_count: 1,
            is_company_driver: isCompany,
          });
        }
      }
    }

    if (orders.length < BATCH) break;
    offset += orders.length;
  }

  console.log(`[recompute] Processed ${totalOrders} locked orders for ${dateType}`);

  // Convert maps to insert arrays
  const dispatchers = Array.from(dispatcherMap.values()).map((d) => ({
    entity_type: "dispatcher",
    entity_id: d.entity_id,
    entity_name: d.entity_name,
    date: d.date,
    date_type: dateType,
    total_freight: d.total_freight,
    total_driver_pay: d.total_driver_pay,
    total_miles: d.total_miles,
    total_dh_miles: d.total_dh_miles,
    order_count: d.order_count,
    is_company_driver: false,
  }));

  const drivers = Array.from(driverAggMap.values()).map((d) => ({
    entity_type: "driver",
    entity_id: d.entity_id,
    entity_name: d.entity_name,
    date: d.date,
    date_type: dateType,
    total_freight: d.total_freight,
    total_driver_pay: d.total_driver_pay,
    total_miles: d.total_miles,
    total_dh_miles: d.total_dh_miles,
    order_count: d.order_count,
    is_company_driver: d.is_company_driver,
  }));

  return { dispatchers, drivers };
}

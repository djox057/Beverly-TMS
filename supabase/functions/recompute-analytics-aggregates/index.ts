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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    // --- Dual auth: CRON_SECRET or admin JWT ---
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let authorized = false;

    // Check CRON_SECRET first
    if (cronSecret && token === cronSecret) {
      authorized = true;
      console.log("[recompute] Auth: CRON_SECRET");
    }

    // Check admin JWT
    if (!authorized && token && token !== supabaseAnonKey) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
      if (!claimsErr && claimsData?.claims?.sub) {
        const userId = claimsData.claims.sub;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: roles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin");
        if (roles && roles.length > 0) {
          authorized = true;
          console.log("[recompute] Auth: admin JWT", userId);
        }
      }
    }

    // Allow anon key calls (for backward compat during testing) — remove after cron is set up
    if (!authorized && token === supabaseAnonKey) {
      authorized = true;
      console.log("[recompute] Auth: anon key (temporary)");
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

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

    let totalInserted = 0;

    for (const dateType of ["pickup", "delivery"] as const) {
      const aggregated = await aggregateOrders(supabase, dateType);

      if (aggregated.dispatchers.length > 0) {
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

    // Swap: delete main, copy from staging
    const { error: mainDelErr } = await supabase
      .from("analytics_locked_daily")
      .delete()
      .gte("id", "00000000-0000-0000-0000-000000000000");

    if (mainDelErr) {
      console.error("[recompute] Failed to clear main table:", mainDelErr);
      throw mainDelErr;
    }

    // Copy staging to main in batches
    let offset = 0;
    const COPY_BATCH = 1000;
    let copiedCount = 0;

    while (true) {
      const { data: stagingRows, error: readErr } = await supabase
        .from("analytics_locked_daily_staging")
        .select("entity_type, entity_id, entity_name, date, date_type, total_freight, total_driver_pay, total_driver_pay_effective, total_miles, total_dh_miles, order_count, is_company_driver")
        .order("id", { ascending: true })
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

      if (stagingRows.length < COPY_BATCH) break;
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
 */
async function aggregateOrders(
  supabase: any,
  dateType: "pickup" | "delivery"
) {
  const dateField = dateType === "pickup" ? "pickup_datetime" : "delivery_datetime";

  const SELECT_COLS = [
    "id",
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
    "canceled",
  ].join(",");

  // Fetch driver company driver flags
  const { data: driversData } = await supabase
    .from("drivers")
    .select("id, name, is_company_driver");

  const driverMap = new Map<string, { name: string; isCompanyDriver: boolean }>();
  (driversData || []).forEach((d: any) => {
    driverMap.set(d.id, { name: d.name || "", isCompanyDriver: d.is_company_driver === true });
  });

  // Dispatcher aggregation: key = `${booked_by}|${date}`
  const dispatcherMap = new Map<string, {
    entity_id: string;
    entity_name: string;
    date: string;
    total_freight: number;
    total_driver_pay: number;
    total_driver_pay_effective: number;
    total_miles: number;
    total_dh_miles: number;
    order_count: number;
  }>();

  // Driver aggregation: key = `${driver1_id}|${date}`
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

  let lastId = "00000000-0000-0000-0000-000000000000";
  const BATCH = 1000;
  let totalOrders = 0;

  while (true) {
    const query = supabase
      .from("orders")
      .select(SELECT_COLS)
      .eq("locked", true)
      .not(dateField, "is", null)
      .or("canceled.eq.false,tonu.gt.0,tonu_driver.gt.0")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(BATCH);

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
        toNum(order.wrong_address_fee_driver) - toNum(order.other_charges_driver) +
        toNum(order.other_additionals_driver);

      const miles = toNum(order.loaded_miles) + toNum(order.dh_miles) + toNum(order.additional_miles);
      const dhMiles = toNum(order.dh_miles);

      // Company driver override: if company driver, effective pay = freight
      const isCompany = order.driver1_id ? (driverMap.get(order.driver1_id)?.isCompanyDriver || false) : false;
      const effectiveDriverPay = isCompany ? freight : driverPay;

      // Dispatcher aggregation
      if (order.booked_by) {
        const dKey = `${order.booked_by}|${dateStr}`;
        const existing = dispatcherMap.get(dKey);
        if (existing) {
          existing.total_freight += freight;
          existing.total_driver_pay += driverPay;
          existing.total_driver_pay_effective += effectiveDriverPay;
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
            total_driver_pay_effective: effectiveDriverPay,
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
    lastId = orders[orders.length - 1].id;
  }

  console.log(`[recompute] Processed ${totalOrders} locked orders for ${dateType}`);

  const dispatchers = Array.from(dispatcherMap.values()).map((d) => ({
    entity_type: "dispatcher",
    entity_id: d.entity_id,
    entity_name: d.entity_name,
    date: d.date,
    date_type: dateType,
    total_freight: d.total_freight,
    total_driver_pay: d.total_driver_pay,
    total_driver_pay_effective: d.total_driver_pay_effective,
    total_miles: d.total_miles,
    total_dh_miles: d.total_dh_miles,
    order_count: d.order_count,
    is_company_driver: false,
  }));

  // For driver rows: total_driver_pay_effective = total_driver_pay (no override at driver level)
  const drivers = Array.from(driverAggMap.values()).map((d) => ({
    entity_type: "driver",
    entity_id: d.entity_id,
    entity_name: d.entity_name,
    date: d.date,
    date_type: dateType,
    total_freight: d.total_freight,
    total_driver_pay: d.total_driver_pay,
    total_driver_pay_effective: d.total_driver_pay,
    total_miles: d.total_miles,
    total_dh_miles: d.total_dh_miles,
    order_count: d.order_count,
    is_company_driver: d.is_company_driver,
  }));

  return { dispatchers, drivers };
}

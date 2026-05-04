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

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth check: admin/manager/accounting only ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const authClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from('user_roles').select('role').eq('user_id', userData.user.id);
    if (!roles?.some((r: any) => ['admin','manager','accounting'].includes(r.role))) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const { startDate, endDate, entityType, dateType } = body;

    if (!startDate || !endDate) {
      return new Response(
        JSON.stringify({ error: "startDate and endDate are required (YYYY-MM-DD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validEntityTypes = ["dispatcher", "driver"];
    const validDateTypes = ["pickup", "delivery"];
    const eType = entityType && validEntityTypes.includes(entityType) ? entityType : null;
    const dType = dateType && validDateTypes.includes(dateType) ? dateType : "pickup";

    console.log(`[validate] Range: ${startDate} to ${endDate}, entity: ${eType || "all"}, dateType: ${dType}`);

    const dateField = dType === "pickup" ? "pickup_datetime" : "delivery_datetime";

    // Step 1: Fetch raw locked orders in date range and compute totals
    const rawTotals = new Map<string, {
      entity_type: string;
      entity_id: string;
      total_freight: number;
      total_driver_pay: number;
      total_miles: number;
      total_dh_miles: number;
      order_count: number;
    }>();

    const toNum = (v: any): number => {
      if (v === null || v === undefined) return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    };

    let offset = 0;
    const BATCH = 1000;

    while (true) {
      let query = supabase
        .from("orders")
        .select("booked_by, driver1_id, " + [
          "freight_amount", "detention", "layover", "tonu", "extra_stop",
          "escort_fee", "other_additionals", "late_fee", "no_tracking_fee",
          "wrong_address_fee", "other_charges",
          "driver_price", "detention_driver", "layover_driver", "tonu_driver",
          "extra_stop_driver", "lumper_driver", "late_fee_driver",
          "no_tracking_fee_driver", "wrong_address_fee_driver",
          "other_charges_driver", "other_additionals_driver",
          "loaded_miles", "dh_miles", "additional_miles",
          dateField,
        ].join(","))
        .eq("locked", true)
        .gte(dateField, `${startDate}T00:00:00`)
        .lte(dateField, `${endDate}T23:59:59`)
        .or("canceled.eq.false,tonu.gt.0,tonu_driver.gt.0")
        .order("id", { ascending: true })
        .range(offset, offset + BATCH - 1);

      const { data: orders, error } = await query;
      if (error) throw error;
      if (!orders || orders.length === 0) break;

      for (const order of orders) {
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

        // Dispatcher
        if ((!eType || eType === "dispatcher") && order.booked_by) {
          const key = `dispatcher|${order.booked_by}`;
          const e = rawTotals.get(key);
          if (e) {
            e.total_freight += freight;
            e.total_driver_pay += driverPay;
            e.total_miles += miles;
            e.total_dh_miles += dhMiles;
            e.order_count += 1;
          } else {
            rawTotals.set(key, {
              entity_type: "dispatcher",
              entity_id: order.booked_by,
              total_freight: freight,
              total_driver_pay: driverPay,
              total_miles: miles,
              total_dh_miles: dhMiles,
              order_count: 1,
            });
          }
        }

        // Driver
        if ((!eType || eType === "driver") && order.driver1_id) {
          const key = `driver|${order.driver1_id}`;
          const e = rawTotals.get(key);
          if (e) {
            e.total_freight += freight;
            e.total_driver_pay += driverPay;
            e.total_miles += miles;
            e.total_dh_miles += dhMiles;
            e.order_count += 1;
          } else {
            rawTotals.set(key, {
              entity_type: "driver",
              entity_id: order.driver1_id,
              total_freight: freight,
              total_driver_pay: driverPay,
              total_miles: miles,
              total_dh_miles: dhMiles,
              order_count: 1,
            });
          }
        }
      }

      if (orders.length < BATCH) break;
      offset += orders.length;
    }

    // Step 2: Fetch precomputed aggregates for same range
    const precomputedTotals = new Map<string, {
      total_freight: number;
      total_driver_pay: number;
      total_miles: number;
      total_dh_miles: number;
      order_count: number;
    }>();

    let aggOffset = 0;
    while (true) {
      let query = supabase
        .from("analytics_locked_daily")
        .select("entity_type, entity_id, total_freight, total_driver_pay, total_miles, total_dh_miles, order_count")
        .eq("date_type", dType)
        .gte("date", startDate)
        .lte("date", endDate)
        .range(aggOffset, aggOffset + 1000 - 1);

      if (eType) {
        query = query.eq("entity_type", eType);
      }

      const { data: rows, error } = await query;
      if (error) throw error;
      if (!rows || rows.length === 0) break;

      for (const row of rows) {
        const key = `${row.entity_type}|${row.entity_id}`;
        const e = precomputedTotals.get(key);
        if (e) {
          e.total_freight += Number(row.total_freight) || 0;
          e.total_driver_pay += Number(row.total_driver_pay) || 0;
          e.total_miles += Number(row.total_miles) || 0;
          e.total_dh_miles += Number(row.total_dh_miles) || 0;
          e.order_count += Number(row.order_count) || 0;
        } else {
          precomputedTotals.set(key, {
            total_freight: Number(row.total_freight) || 0,
            total_driver_pay: Number(row.total_driver_pay) || 0,
            total_miles: Number(row.total_miles) || 0,
            total_dh_miles: Number(row.total_dh_miles) || 0,
            order_count: Number(row.order_count) || 0,
          });
        }
      }

      if (rows.length < 1000) break;
      aggOffset += rows.length;
    }

    // Step 3: Compare
    const TOLERANCE = 0.01;
    const mismatches: any[] = [];

    // Check all raw entries against precomputed
    for (const [key, raw] of rawTotals) {
      const pre = precomputedTotals.get(key);
      if (!pre) {
        mismatches.push({
          key,
          entity_type: raw.entity_type,
          entity_id: raw.entity_id,
          issue: "missing_in_precomputed",
          raw,
          precomputed: null,
        });
        continue;
      }

      const diffs: string[] = [];
      if (Math.abs(raw.total_freight - pre.total_freight) > TOLERANCE) diffs.push(`freight: raw=${raw.total_freight.toFixed(2)} pre=${pre.total_freight.toFixed(2)}`);
      if (Math.abs(raw.total_driver_pay - pre.total_driver_pay) > TOLERANCE) diffs.push(`driverPay: raw=${raw.total_driver_pay.toFixed(2)} pre=${pre.total_driver_pay.toFixed(2)}`);
      if (Math.abs(raw.total_miles - pre.total_miles) > TOLERANCE) diffs.push(`miles: raw=${raw.total_miles.toFixed(2)} pre=${pre.total_miles.toFixed(2)}`);
      if (Math.abs(raw.total_dh_miles - pre.total_dh_miles) > TOLERANCE) diffs.push(`dhMiles: raw=${raw.total_dh_miles.toFixed(2)} pre=${pre.total_dh_miles.toFixed(2)}`);
      if (raw.order_count !== pre.order_count) diffs.push(`count: raw=${raw.order_count} pre=${pre.order_count}`);

      if (diffs.length > 0) {
        mismatches.push({
          key,
          entity_type: raw.entity_type,
          entity_id: raw.entity_id,
          issue: "value_mismatch",
          diffs,
          raw,
          precomputed: pre,
        });
      }
    }

    // Check for precomputed entries not in raw
    for (const [key, pre] of precomputedTotals) {
      if (!rawTotals.has(key)) {
        mismatches.push({
          key,
          issue: "extra_in_precomputed",
          raw: null,
          precomputed: pre,
        });
      }
    }

    console.log(`[validate] Raw entities: ${rawTotals.size}, Precomputed entities: ${precomputedTotals.size}, Mismatches: ${mismatches.length}`);

    return new Response(
      JSON.stringify({
        valid: mismatches.length === 0,
        rawEntityCount: rawTotals.size,
        precomputedEntityCount: precomputedTotals.size,
        mismatchCount: mismatches.length,
        mismatches: mismatches.slice(0, 50), // Limit response size
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[validate] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

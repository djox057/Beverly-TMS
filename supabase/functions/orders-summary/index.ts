import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type OrdersSummaryFilters = {
  companyId?: string;
  loadNumberSuffix?: string;
  bookedBy?: string;
  truckId?: string;
  driverId?: string;
  brokerId?: string;
  statusFilter?: "canceled" | "pending-payment" | "billed";
  lockedNotInvoiced?: boolean;
  invoiced?: boolean;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  pickupDateFrom?: string;
  pickupDateTo?: string;
  locked?: boolean;
  excludeBookedByCompanyId?: string;
};

const applyFilters = (query: any, filters: OrdersSummaryFilters) => {
  if (filters.companyId) query = query.eq("booked_by_company_id", filters.companyId);

  if (filters.loadNumberSuffix) {
    const suffix = filters.loadNumberSuffix.replace(/^-+/, "").toUpperCase();
    query = query.ilike("internal_load_number", `%-${suffix}`);
  }

  if (filters.bookedBy) query = query.eq("booked_by", filters.bookedBy);

  if (filters.excludeBookedByCompanyId) {
    query = query.or(`booked_by_company_id.neq.${filters.excludeBookedByCompanyId},booked_by_company_id.is.null`);
  }

  if (filters.truckId) query = query.eq("truck_id", filters.truckId);
  if (filters.driverId) query = query.or(`driver1_id.eq.${filters.driverId},driver2_id.eq.${filters.driverId}`);
  if (filters.brokerId) query = query.eq("broker_id", filters.brokerId);

  if (filters.statusFilter === "canceled") {
    query = query.eq("canceled", true);
  } else if (filters.statusFilter === "pending-payment") {
    query = query.eq("invoiced", true).or("paid.is.null,paid.eq.false");
  } else if (filters.statusFilter === "billed") {
    query = query.eq("paid", true);
  }

  if (filters.locked !== undefined) query = query.eq("locked", filters.locked);
  if (filters.lockedNotInvoiced) query = query.eq("locked", true).eq("invoiced", false);
  if (filters.invoiced) query = query.eq("invoiced", true);

  if (filters.deliveryDateFrom) query = query.gte("delivery_datetime", filters.deliveryDateFrom);
  if (filters.deliveryDateTo) query = query.lte("delivery_datetime", filters.deliveryDateTo);
  if (filters.pickupDateFrom) query = query.gte("pickup_datetime", filters.pickupDateFrom);
  if (filters.pickupDateTo) query = query.lte("pickup_datetime", filters.pickupDateTo);

  return query;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Role gate: only operational roles may read order aggregates
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleRows } = await supabaseService
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const allowed = new Set([
      "admin",
      "manager",
      "accounting",
      "safety",
      "supervisor",
      "dispatch",
      "afterhours",
    ]);
    const userRoles = (roleRows || []).map((r: any) => r.role);
    if (!userRoles.some((r: string) => allowed.has(r))) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let filters: OrdersSummaryFilters = {};
    if (req.method === "POST") {
      try {
        const body = await req.json();
        filters = body?.filters || {};
      } catch {
        filters = {};
      }
    }

    const PAGE = 1000;
    let from = 0;
    let totalCount = 0;
    let unlockedCount = 0;
    let lockedCount = 0;
    let invoicedCount = 0;
    let notInvoicedCount = 0;
    let freightSum = 0;
    let driverPaySum = 0;

    while (true) {
      let query = supabaseService
        .from("orders")
        .select("locked,invoiced,freight_amount,driver_price", { count: from === 0 ? "exact" : undefined })
        .order("locked", { ascending: true })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE - 1);

      query = applyFilters(query, filters);
      const { data, error, count } = await query;
      if (error) {
        console.error("[orders-summary] Query error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const rows = data || [];
      if (from === 0) totalCount = count ?? rows.length;

      for (const row of rows as any[]) {
        if (row.locked === true) lockedCount += 1;
        else unlockedCount += 1;

        if (row.invoiced === true) invoicedCount += 1;
        else notInvoicedCount += 1;

        freightSum += Number(row.freight_amount) || 0;
        driverPaySum += Number(row.driver_price) || 0;
      }

      if (rows.length < PAGE) break;
      from += PAGE;
    }

    return new Response(JSON.stringify({
      totalCount,
      unlockedCount,
      lockedCount,
      invoicedCount,
      notInvoicedCount,
      freightSum,
      driverPaySum,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[orders-summary] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

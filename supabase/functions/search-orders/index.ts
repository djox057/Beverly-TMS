import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SearchFilters {
  companyId?: string;
  loadNumberSuffix?: string;
  bookedBy?: string;
  truckId?: string;
  driverId?: string;
  brokerId?: string;
  lockedNotInvoiced?: boolean;
  invoiced?: boolean;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  pickupDateFrom?: string;
  pickupDateTo?: string;
  locked?: boolean; // true = only locked, false = only unlocked, undefined = both
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();

    // Create Supabase client with service role for optimal performance
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Require authentication
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

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse filters from request body
    let filters: SearchFilters = {};
    let offset = 0;
    let limit = 500; // Default batch size for filtered results

    if (req.method === "POST") {
      try {
        const body = await req.json();
        filters = body.filters || {};
        offset = body.offset || 0;
        limit = Math.min(body.limit || 500, 1000); // Cap at 1000
      } catch {
        // No body or invalid JSON - proceed with defaults
      }
    }

    console.log(`[search-orders] Searching with filters:`, JSON.stringify(filters));

    // Build query with all relational data
    let query = supabase
      .from("orders")
      .select(`
        *,
        pickup_drops (
          id,
          type,
          address,
          city,
          state,
          zip_code,
          datetime,
          end_datetime,
          sequence_number,
          arrived_at,
          checked_out_at,
          going_to_at,
          company_name,
          contact_name,
          contact_phone,
          special_instructions
        ),
        order_files (
          id,
          file_category,
          file_name,
          file_path
        ),
        order_transfers (
          id,
          sequence_number,
          driver1_id,
          driver2_id,
          truck_id,
          trailer_id,
          miles,
          driver_price,
          manual_driver_name,
          manual_truck_number,
          manual_trailer_number,
          transfer_date,
          transfer_city,
          transfer_state,
          transfer_address,
          transfer_datetime,
          transfer_latitude,
          transfer_longitude,
          driver1:drivers!order_transfers_driver1_id_fkey (
            id,
            name
          ),
          driver2:drivers!order_transfers_driver2_id_fkey (
            id,
            name
          ),
          truck:trucks!order_transfers_truck_id_fkey (
            id,
            truck_number
          ),
          trailer:trailers!order_transfers_trailer_id_fkey (
            id,
            trailer_number
          )
        ),
        recovery_history (
          id,
          recovery_driver1_id,
          recovery_driver2_id,
          recovery_truck_id,
          recovery_trailer_id,
          recovery_driver1:drivers!recovery_history_recovery_driver1_id_fkey (
            id,
            name
          ),
          recovery_driver2:drivers!recovery_history_recovery_driver2_id_fkey (
            id,
            name
          ),
          recovery_truck:trucks!recovery_history_recovery_truck_id_fkey (
            id,
            truck_number
          ),
          recovery_trailer:trailers!recovery_history_recovery_trailer_id_fkey (
            id,
            trailer_number
          )
        ),
        broker:brokers (
          id,
          name,
          mc_number,
          address
        ),
        company:companies!orders_company_id_fkey (
          id,
          name
        ),
        booked_by_company:companies!orders_booked_by_company_id_fkey (
          id,
          name
        ),
        truck:trucks!orders_truck_id_fkey (
          id,
          truck_number,
          company:companies (
            id,
            name
          )
        ),
        trailer:trailers!orders_trailer_id_fkey (
          id,
          trailer_number
        ),
        driver1:drivers!orders_driver1_id_fkey (
          id,
          name,
          company_id,
          company:companies (
            id,
            name
          )
        ),
        driver2:drivers!orders_driver2_id_fkey (
          id,
          name,
          company_id,
          company:companies (
            id,
            name
          )
        ),
        original_driver1:drivers!orders_original_driver1_id_fkey (
          id,
          name
        ),
        original_driver2:drivers!orders_original_driver2_id_fkey (
          id,
          name
        ),
        original_truck:trucks!orders_original_truck_id_fkey (
          id,
          truck_number
        ),
        original_trailer:trailers!orders_original_trailer_id_fkey (
          id,
          trailer_number
        )
      `, { count: "exact" });

    // Apply filters - each filter narrows down results

    // Company filter (Booked By Company)
    // UI's "Companies" filter is based on `bookedByCompanyName`.
    if (filters.companyId) {
      query = query.eq("booked_by_company_id", filters.companyId);
    }

    // Truck company filter — now filtered by internal load number suffix
    // (e.g. "-UE", "-AP") rather than by the driver's assigned truck company.
    if (filters.loadNumberSuffix) {
      const suffix = filters.loadNumberSuffix.replace(/^-+/, "").toUpperCase();
      query = query.ilike("internal_load_number", `%-${suffix}`);
    }
    
    // Booked by filter
    if (filters.bookedBy) {
      query = query.eq("booked_by", filters.bookedBy);
    }

    // Truck filter
    if (filters.truckId) {
      query = query.eq("truck_id", filters.truckId);
    }

    // Driver filter (matches driver1 OR driver2)
    if (filters.driverId) {
      query = query.or(`driver1_id.eq.${filters.driverId},driver2_id.eq.${filters.driverId}`);
    }

    // Broker filter
    if (filters.brokerId) {
      query = query.eq("broker_id", filters.brokerId);
    }

    // Locked/unlocked filter
    if (filters.locked !== undefined) {
      query = query.eq("locked", filters.locked);
    }

    // Locked but not invoiced
    if (filters.lockedNotInvoiced) {
      query = query.eq("locked", true).eq("invoiced", false);
    }

    // Invoiced filter
    if (filters.invoiced) {
      query = query.eq("invoiced", true);
    }

    // Delivery date range
    if (filters.deliveryDateFrom) {
      query = query.gte("delivery_datetime", filters.deliveryDateFrom);
    }
    if (filters.deliveryDateTo) {
      query = query.lte("delivery_datetime", filters.deliveryDateTo);
    }

    // Pickup date range
    if (filters.pickupDateFrom) {
      query = query.gte("pickup_datetime", filters.pickupDateFrom);
    }
    if (filters.pickupDateTo) {
      query = query.lte("pickup_datetime", filters.pickupDateTo);
    }

    // Order and paginate
    query = query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    const { data: orders, error: fetchError, count } = await query;

    if (fetchError) {
      console.error(`[search-orders] Fetch error:`, fetchError);
      throw fetchError;
    }

    // No post-processing needed; all DB-backed filters are applied server-side.
    const filteredOrders = orders || [];

    const fetchTime = Date.now() - startTime;
    console.log(`[search-orders] Found ${filteredOrders.length} orders (total: ${count}) in ${fetchTime}ms`);

    const hasMore = orders && orders.length === limit;

    return new Response(
      JSON.stringify({
        orders: filteredOrders,
        count: filteredOrders.length,
        totalCount: count,
        offset,
        limit,
        hasMore,
        fetchTimeMs: fetchTime,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[search-orders] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});

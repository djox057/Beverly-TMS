import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional filters and pagination from request body
    let bookedBy: string | null = null;
    let dispatcherDriverIds: string[] = [];
    let offset = 0;
    let limit = 100; // Default batch size
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        bookedBy = body.bookedBy || null;
        dispatcherDriverIds = body.dispatcherDriverIds || [];
        offset = body.offset || 0;
        // Reduce batch size at higher offsets to avoid timeouts
        const defaultLimit = offset >= 5000 ? 500 : (offset >= 3000 ? 750 : 1000);
        limit = Math.min(body.limit || defaultLimit, 1000);
      } catch {
        // No body or invalid JSON - proceed with defaults
      }
    }

    console.log(`[get-all-locked-orders] Fetching batch: offset=${offset}, limit=${limit}`);

    // Get total count first (only on first request)
    let totalCount: number | null = null;
    if (offset === 0) {
      let countQuery = supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("locked", true);

      // Apply filters to count
      if (bookedBy && dispatcherDriverIds.length > 0) {
        countQuery = countQuery.or(
          `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
        );
      } else if (bookedBy) {
        countQuery = countQuery.eq("booked_by", bookedBy);
      } else if (dispatcherDriverIds.length > 0) {
        countQuery = countQuery.in("driver1_id", dispatcherDriverIds);
      }

      const { count, error: countError } = await countQuery;
      
      if (countError) {
        console.error("[get-all-locked-orders] Count error:", countError);
        throw countError;
      }
      
      totalCount = count;
      console.log(`[get-all-locked-orders] Total locked orders: ${totalCount}`);
    }

    // Fetch batch of locked orders
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
      `)
      .eq("locked", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply filters
    if (bookedBy && dispatcherDriverIds.length > 0) {
      query = query.or(
        `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
      );
    } else if (bookedBy) {
      query = query.eq("booked_by", bookedBy);
    } else if (dispatcherDriverIds.length > 0) {
      query = query.in("driver1_id", dispatcherDriverIds);
    }

    const { data: orders, error: fetchError } = await query;

    if (fetchError) {
      console.error(`[get-all-locked-orders] Fetch error:`, fetchError);
      throw fetchError;
    }

    const fetchTime = Date.now() - startTime;
    console.log(`[get-all-locked-orders] Fetched ${orders?.length || 0} orders in ${fetchTime}ms (offset=${offset})`);

    const hasMore = orders && orders.length === limit;

    return new Response(
      JSON.stringify({
        orders: orders || [],
        count: orders?.length || 0,
        totalCount: totalCount, // Only set on first request
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
    console.error("[get-all-locked-orders] Error:", error);
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

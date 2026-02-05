import { createClient } from "npm:@supabase/supabase-js@2.49.1";

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
    console.log("[get-billboard-orders] Starting fetch for last 30 days...");

    // Create Supabase client with service role for optimal performance
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Calculate 30 days ago cutoff date
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString();
    
    console.log(`[get-billboard-orders] Cutoff date: ${cutoffDate}`);

    // Step 1: Fetch total count first for verification
    const { count: totalCount, error: countError } = await supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .gte("delivery_datetime", cutoffDate);
    
    if (countError) {
      console.error("[get-billboard-orders] Count error:", countError);
      throw countError;
    }

    console.log(`[get-billboard-orders] Total orders in last 30 days: ${totalCount}`);

    // Step 2: Fetch orders in batches
    const BATCH_SIZE = 1000;
    let allOrders: any[] = [];
    let currentOffset = 0;

    while (true) {
      const query = supabase
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
        .gte("delivery_datetime", cutoffDate)
        .order("delivery_datetime", { ascending: false })
        .range(currentOffset, currentOffset + BATCH_SIZE - 1);

      const { data: batch, error: batchError } = await query;

      if (batchError) {
        console.error(`[get-billboard-orders] Batch error at offset ${currentOffset}:`, batchError);
        throw batchError;
      }

      if (!batch || batch.length === 0) {
        break;
      }

      allOrders = allOrders.concat(batch);
      console.log(`[get-billboard-orders] Fetched batch: ${batch.length}, total: ${allOrders.length}`);

      if (batch.length < BATCH_SIZE) {
        break;
      }

      currentOffset += BATCH_SIZE;
    }

    const fetchTime = Date.now() - startTime;
    console.log(`[get-billboard-orders] Completed: ${allOrders.length} orders in ${fetchTime}ms`);

    // Verify data integrity
    if (totalCount !== null && allOrders.length !== totalCount) {
      console.warn(`[get-billboard-orders] Count mismatch: expected ${totalCount}, got ${allOrders.length}`);
    }

    return new Response(
      JSON.stringify({
        orders: allOrders,
        count: allOrders.length,
        expectedCount: totalCount,
        fetchTimeMs: fetchTime,
        cutoffDate,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("[get-billboard-orders] Error:", error);
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

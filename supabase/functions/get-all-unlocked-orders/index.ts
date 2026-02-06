import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Flat column list for orders - NO joins
const ORDER_COLUMNS = `
  id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
  created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
  canceled, driver1_id, driver2_id, truck_id, trailer_id, broker_id, company_id, booked_by_company_id,
  is_recovery, locked, mileage, loaded_miles, dh_miles, original_driver1_id, original_driver2_id,
  deleted_truck_number, deleted_trailer_number, deleted_driver1_name, deleted_driver2_name,
  freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
  tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver,
  late_fee, late_fee_driver, no_tracking_fee, no_tracking_fee_driver,
  wrong_address_fee, wrong_address_fee_driver, escort_fee,
  other_charges, other_charges_driver, booked_by,
  original_truck_id, original_trailer_id
`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    console.log("[get-all-unlocked-orders] Starting bulk fetch...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse optional filters
    let bookedBy: string | null = null;
    let dispatcherDriverIds: string[] = [];
    let limit: number | null = null;
    let offset: number = 0;
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        bookedBy = body.bookedBy || null;
        dispatcherDriverIds = body.dispatcherDriverIds || [];
        limit = body.limit || null;
        offset = body.offset || 0;
      } catch {
        // No body or invalid JSON
      }
    }

    console.log(`[get-all-unlocked-orders] limit=${limit}, offset=${offset}`);

    // Step 1: Total count
    let countQuery = supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("locked", false);

    if (bookedBy && dispatcherDriverIds.length > 0) {
      countQuery = countQuery.or(
        `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
      );
    } else if (bookedBy) {
      countQuery = countQuery.eq("booked_by", bookedBy);
    } else if (dispatcherDriverIds.length > 0) {
      countQuery = countQuery.in("driver1_id", dispatcherDriverIds);
    }

    const { count: totalCount, error: countError } = await countQuery;
    if (countError) {
      console.error("[get-all-unlocked-orders] Count error:", countError);
      throw countError;
    }

    console.log(`[get-all-unlocked-orders] Total unlocked orders: ${totalCount}`);

    // Step 2: Fetch FLAT orders in batches (no joins)
    const BATCH_SIZE = limit ?? 1000;
    let allOrders: any[] = [];
    let currentOffset = offset;

    const stage1Start = Date.now();

    while (true) {
      let query = supabase
        .from("orders")
        .select(ORDER_COLUMNS)
        .eq("locked", false)
        .order("created_at", { ascending: false })
        .range(currentOffset, currentOffset + BATCH_SIZE - 1);

      if (bookedBy && dispatcherDriverIds.length > 0) {
        query = query.or(
          `booked_by.eq.${bookedBy},driver1_id.in.(${dispatcherDriverIds.join(",")})`
        );
      } else if (bookedBy) {
        query = query.eq("booked_by", bookedBy);
      } else if (dispatcherDriverIds.length > 0) {
        query = query.in("driver1_id", dispatcherDriverIds);
      }

      const { data: batch, error: batchError } = await query;

      if (batchError) {
        console.error(`[get-all-unlocked-orders] Batch error at offset ${currentOffset}:`, batchError);
        throw batchError;
      }

      if (!batch || batch.length === 0) break;

      allOrders = allOrders.concat(batch);
      console.log(`[get-all-unlocked-orders] Fetched batch: ${batch.length}, total: ${allOrders.length}`);

      // If limit was specified, only fetch one batch
      if (limit !== null) break;
      if (batch.length < BATCH_SIZE) break;

      currentOffset += BATCH_SIZE;
    }

    const stage1Time = Date.now() - stage1Start;
    console.log(`[get-all-unlocked-orders] Stage 1 (flat orders): ${allOrders.length} in ${stage1Time}ms`);

    // Step 3: Batch fetch relations using .in() - parallel
    const orderIds = allOrders.map((o: any) => o.id);

    if (orderIds.length > 0) {
      const stage2Start = Date.now();

      // Split into chunks of 500 to avoid URL length limits
      const chunkSize = 500;
      const chunks: string[][] = [];
      for (let i = 0; i < orderIds.length; i += chunkSize) {
        chunks.push(orderIds.slice(i, i + chunkSize));
      }

      const [pickupDropsResults, orderFilesResults, orderTransfersResults] = await Promise.all([
        Promise.all(chunks.map(chunk =>
          supabase
            .from("pickup_drops")
            .select("id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at, company_name, contact_name, contact_phone, special_instructions")
            .in("order_id", chunk)
        )),
        Promise.all(chunks.map(chunk =>
          supabase
            .from("order_files")
            .select("id, order_id, file_category, file_name, file_path")
            .in("order_id", chunk)
        )),
        Promise.all(chunks.map(chunk =>
          supabase
            .from("order_transfers")
            .select("id, order_id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, manual_driver_name, manual_truck_number, manual_trailer_number, transfer_date, transfer_city, transfer_state, transfer_address, transfer_datetime, transfer_latitude, transfer_longitude")
            .in("order_id", chunk)
        )),
      ]);

      // Flatten chunked results
      const allPickupDrops = pickupDropsResults.flatMap(r => r.data || []);
      const allOrderFiles = orderFilesResults.flatMap(r => r.data || []);
      const allOrderTransfers = orderTransfersResults.flatMap(r => r.data || []);

      for (const r of [...pickupDropsResults, ...orderFilesResults, ...orderTransfersResults]) {
        if (r.error) console.error("[get-all-unlocked-orders] Relation fetch error:", r.error);
      }

      const stage2Time = Date.now() - stage2Start;
      console.log(`[get-all-unlocked-orders] Stage 2 (relations): ${allPickupDrops.length} PDs, ${allOrderFiles.length} files, ${allOrderTransfers.length} transfers in ${stage2Time}ms`);

      // Stage 3: Group and attach
      const pdMap = new Map<string, any[]>();
      for (const pd of allPickupDrops) {
        const arr = pdMap.get(pd.order_id);
        if (arr) arr.push(pd);
        else pdMap.set(pd.order_id, [pd]);
      }

      const ofMap = new Map<string, any[]>();
      for (const f of allOrderFiles) {
        const arr = ofMap.get(f.order_id);
        if (arr) arr.push(f);
        else ofMap.set(f.order_id, [f]);
      }

      const otMap = new Map<string, any[]>();
      for (const t of allOrderTransfers) {
        const arr = otMap.get(t.order_id);
        if (arr) arr.push(t);
        else otMap.set(t.order_id, [t]);
      }

      for (const order of allOrders) {
        order.pickup_drops = pdMap.get(order.id) || [];
        order.order_files = ofMap.get(order.id) || [];
        order.order_transfers = otMap.get(order.id) || [];
      }
    }

    const fetchTime = Date.now() - startTime;
    console.log(`[get-all-unlocked-orders] TOTAL: ${allOrders.length} orders in ${fetchTime}ms`);

    if (totalCount !== null && allOrders.length !== totalCount) {
      console.warn(`[get-all-unlocked-orders] Count mismatch: expected ${totalCount}, got ${allOrders.length}`);
    }

    return new Response(
      JSON.stringify({
        orders: allOrders,
        count: allOrders.length,
        expectedCount: totalCount,
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
    console.error("[get-all-unlocked-orders] Error:", error);
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

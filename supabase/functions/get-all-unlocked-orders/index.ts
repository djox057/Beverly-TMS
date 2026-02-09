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
  other_charges, other_charges_driver, other_charges_reason,
  other_additionals, other_additionals_driver, other_additionals_reason,
  additional_miles, booked_by,
  original_truck_id, original_trailer_id
`;

// Helper to split array into chunks
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Helper to collect unique non-null IDs from orders
function collectUniqueIds(orders: any[], ...fields: string[]): string[] {
  const ids = new Set<string>();
  for (const order of orders) {
    for (const field of fields) {
      if (order[field]) ids.add(order[field]);
    }
  }
  return Array.from(ids);
}

// Helper to batch fetch and build a Map by id
async function batchFetchById(
  supabase: any,
  table: string,
  ids: string[],
  selectColumns: string,
  chunkSize = 200
): Promise<Map<string, any>> {
  if (ids.length === 0) return new Map();
  
  const chunks = chunk(ids, chunkSize);
  const results = await Promise.all(
    chunks.map(c => supabase.from(table).select(selectColumns).in("id", c))
  );
  
  const map = new Map<string, any>();
  for (const r of results) {
    if (r.error) {
      console.error(`[get-all-unlocked-orders] Error fetching ${table}:`, r.error.message);
      continue;
    }
    for (const item of r.data || []) {
      map.set(item.id, item);
    }
  }
  return map;
}

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

    // Step 3: Batch fetch child relations (pickup_drops, order_files, order_transfers)
    const orderIds = allOrders.map((o: any) => o.id);
    const CHUNK_SIZE = 200; // Reduced from 500 to prevent URL length errors

    if (orderIds.length > 0) {
      const stage2Start = Date.now();
      const chunks = chunk(orderIds, CHUNK_SIZE);

      const [pickupDropsResults, orderFilesResults, orderTransfersResults] = await Promise.all([
        Promise.all(chunks.map(c =>
          supabase
            .from("pickup_drops")
            .select("id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at, company_name, contact_name, contact_phone, special_instructions")
            .in("order_id", c)
        )),
        Promise.all(chunks.map(c =>
          supabase
            .from("order_files")
            .select("id, order_id, file_category, file_name, file_path")
            .in("order_id", c)
        )),
        Promise.all(chunks.map(c =>
          supabase
            .from("order_transfers")
            .select("id, order_id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, manual_driver_name, manual_truck_number, manual_trailer_number, transfer_date, transfer_city, transfer_state, transfer_address, transfer_datetime, transfer_latitude, transfer_longitude")
            .in("order_id", c)
        )),
      ]);

      const allPickupDrops = pickupDropsResults.flatMap(r => r.data || []);
      const allOrderFiles = orderFilesResults.flatMap(r => r.data || []);
      const allOrderTransfers = orderTransfersResults.flatMap(r => r.data || []);

      for (const r of [...pickupDropsResults, ...orderFilesResults, ...orderTransfersResults]) {
        if (r.error) console.error("[get-all-unlocked-orders] Relation fetch error:", r.error.message);
      }

      const stage2Time = Date.now() - stage2Start;
      console.log(`[get-all-unlocked-orders] Stage 2 (child relations): ${allPickupDrops.length} PDs, ${allOrderFiles.length} files, ${allOrderTransfers.length} transfers in ${stage2Time}ms`);

      // Group by order_id
      const pdMap = new Map<string, any[]>();
      for (const pd of allPickupDrops) {
        const arr = pdMap.get(pd.order_id); if (arr) arr.push(pd); else pdMap.set(pd.order_id, [pd]);
      }
      const ofMap = new Map<string, any[]>();
      for (const f of allOrderFiles) {
        const arr = ofMap.get(f.order_id); if (arr) arr.push(f); else ofMap.set(f.order_id, [f]);
      }
      const otMap = new Map<string, any[]>();
      for (const t of allOrderTransfers) {
        const arr = otMap.get(t.order_id); if (arr) arr.push(t); else otMap.set(t.order_id, [t]);
      }

      for (const order of allOrders) {
        order.pickup_drops = pdMap.get(order.id) || [];
        order.order_files = ofMap.get(order.id) || [];
        order.order_transfers = otMap.get(order.id) || [];
      }
    }

    // Step 4: Batch fetch entity relations (trucks, drivers, brokers, companies, trailers)
    // This provides the nested objects that transformOrders expects
    const stage3Start = Date.now();

    const truckIds = collectUniqueIds(allOrders, "truck_id", "original_truck_id");
    const driverIds = collectUniqueIds(allOrders, "driver1_id", "driver2_id", "original_driver1_id", "original_driver2_id");
    const brokerIds = collectUniqueIds(allOrders, "broker_id");
    const companyIds = collectUniqueIds(allOrders, "company_id", "booked_by_company_id");
    const trailerIds = collectUniqueIds(allOrders, "trailer_id", "original_trailer_id");

    const [trucksMap, driversMap, brokersMap, companiesMap, trailersMap] = await Promise.all([
      batchFetchById(supabase, "trucks", truckIds, "id, truck_number, company_id"),
      batchFetchById(supabase, "drivers", driverIds, "id, name, company_id"),
      batchFetchById(supabase, "brokers", brokerIds, "id, name, mc_number, address"),
      batchFetchById(supabase, "companies", companyIds, "id, name"),
      batchFetchById(supabase, "trailers", trailerIds, "id, trailer_number"),
    ]);

    // Enrich trucks with company name
    for (const [, truck] of trucksMap) {
      if (truck.company_id && companiesMap.has(truck.company_id)) {
        truck.company = companiesMap.get(truck.company_id);
      }
    }

    // Enrich drivers with company
    for (const [, driver] of driversMap) {
      if (driver.company_id && companiesMap.has(driver.company_id)) {
        driver.company = companiesMap.get(driver.company_id);
      }
    }

    // Attach entity objects to orders
    for (const order of allOrders) {
      order.truck = trucksMap.get(order.truck_id) || null;
      order.trailer = trailersMap.get(order.trailer_id) || null;
      order.driver1 = driversMap.get(order.driver1_id) || null;
      order.driver2 = driversMap.get(order.driver2_id) || null;
      order.broker = brokersMap.get(order.broker_id) || null;
      order.company = companiesMap.get(order.company_id) || null;
      order.booked_by_company = companiesMap.get(order.booked_by_company_id) || null;
      order.original_truck = trucksMap.get(order.original_truck_id) || null;
      order.original_trailer = trailersMap.get(order.original_trailer_id) || null;
      order.original_driver1 = driversMap.get(order.original_driver1_id) || null;
      order.original_driver2 = driversMap.get(order.original_driver2_id) || null;
    }

    const stage3Time = Date.now() - stage3Start;
    console.log(`[get-all-unlocked-orders] Stage 3 (entities): ${truckIds.length} trucks, ${driverIds.length} drivers, ${brokerIds.length} brokers, ${companyIds.length} companies in ${stage3Time}ms`);

    const fetchTime = Date.now() - startTime;
    console.log(`[get-all-unlocked-orders] TOTAL: ${allOrders.length} orders in ${fetchTime}ms`);

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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Authenticate - check for CRON_SECRET or valid JWT
    const authHeader = req.headers.get("Authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const isCronRequest = token === cronSecret;

    // Create Supabase client with service role for full access
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // If not a cron request, validate JWT
    if (!isCronRequest) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      
      const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claims?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("Starting archived orders sync...");

    // Step 1: Fetch all locked orders
    const { data: orders, error: ordersError } = await supabase
      .from("orders")
      .select("*")
      .eq("locked", true)
      .order("created_at", { ascending: true });

    if (ordersError) {
      throw new Error(`Failed to fetch orders: ${ordersError.message}`);
    }

    console.log(`Fetched ${orders?.length || 0} locked orders`);

    // Get order IDs for related queries
    const orderIds = orders?.map((o) => o.id) || [];

    // Step 2: Fetch pickup_drops for locked orders (in batches if needed)
    let allPickupDrops: any[] = [];
    const batchSize = 500;
    
    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batchIds = orderIds.slice(i, i + batchSize);
      const { data: pickupDrops, error: pdError } = await supabase
        .from("pickup_drops")
        .select("*")
        .in("order_id", batchIds)
        .order("created_at", { ascending: true });

      if (pdError) {
        throw new Error(`Failed to fetch pickup_drops batch ${i}: ${pdError.message}`);
      }
      
      allPickupDrops = allPickupDrops.concat(pickupDrops || []);
    }

    console.log(`Fetched ${allPickupDrops.length} pickup_drops`);

    // Step 3: Fetch order_files for locked orders (in batches if needed)
    let allOrderFiles: any[] = [];
    
    for (let i = 0; i < orderIds.length; i += batchSize) {
      const batchIds = orderIds.slice(i, i + batchSize);
      const { data: orderFiles, error: ofError } = await supabase
        .from("order_files")
        .select("*")
        .in("order_id", batchIds)
        .order("created_at", { ascending: true });

      if (ofError) {
        throw new Error(`Failed to fetch order_files batch ${i}: ${ofError.message}`);
      }
      
      allOrderFiles = allOrderFiles.concat(orderFiles || []);
    }

    console.log(`Fetched ${allOrderFiles.length} order_files`);

    // Step 4: Upload to storage bucket
    const timestamp = new Date().toISOString();

    // Upload locked-orders.json
    const ordersJson = JSON.stringify(orders || []);
    const { error: ordersUploadError } = await supabase.storage
      .from("archived-orders")
      .upload("locked-orders.json", ordersJson, {
        contentType: "application/json",
        upsert: true,
      });

    if (ordersUploadError) {
      throw new Error(`Failed to upload orders: ${ordersUploadError.message}`);
    }

    // Upload pickup-drops.json
    const pickupDropsJson = JSON.stringify(allPickupDrops);
    const { error: pdUploadError } = await supabase.storage
      .from("archived-orders")
      .upload("pickup-drops.json", pickupDropsJson, {
        contentType: "application/json",
        upsert: true,
      });

    if (pdUploadError) {
      throw new Error(`Failed to upload pickup_drops: ${pdUploadError.message}`);
    }

    // Upload order-files.json
    const orderFilesJson = JSON.stringify(allOrderFiles);
    const { error: ofUploadError } = await supabase.storage
      .from("archived-orders")
      .upload("order-files.json", orderFilesJson, {
        contentType: "application/json",
        upsert: true,
      });

    if (ofUploadError) {
      throw new Error(`Failed to upload order_files: ${ofUploadError.message}`);
    }

    console.log("All files uploaded to storage");

    // Step 5: Update archive_version table to invalidate client caches
    const archiveTypes = ["locked-orders", "pickup-drops", "order-files"];
    
    for (const archiveType of archiveTypes) {
      const { error: versionError } = await supabase
        .from("archive_version")
        .upsert(
          { archive_type: archiveType, version: timestamp },
          { onConflict: "archive_type" }
        );

      if (versionError) {
        console.error(`Failed to update version for ${archiveType}:`, versionError);
      }
    }

    console.log("Archive versions updated");

    const duration = Date.now() - startTime;
    const result = {
      success: true,
      timestamp,
      counts: {
        orders: orders?.length || 0,
        pickup_drops: allPickupDrops.length,
        order_files: allOrderFiles.length,
      },
      duration_ms: duration,
    };

    console.log("Sync completed:", result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sync failed:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        duration_ms: Date.now() - startTime,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

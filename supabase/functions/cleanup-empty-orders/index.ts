import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const okCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const okService = serviceRoleKey && authHeader?.includes(serviceRoleKey);
    if (!okCron && !okService) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey!
    );

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // DISABLED: loads must never be deleted from the database.
    // This routine is now report-only — it counts what the old rule would have
    // matched and deletes nothing. Cancellation is the only removal mechanism.
    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .lt("created_at", cutoff)
      .eq("canceled", true)
      .or("freight_amount.is.null,freight_amount.eq.0")
      .or("driver_price.is.null,driver_price.eq.0")
      .or("loaded_miles.is.null,loaded_miles.eq.0")
      .or("dh_miles.is.null,dh_miles.eq.0");

    if (error) throw error;

    const matchedCount = data?.length ?? 0;
    console.log(
      `cleanup-empty-orders: DISABLED (no deletions). ${matchedCount} canceled orders older than ${cutoff} would have matched the old rule.`
    );

    return new Response(
      JSON.stringify({ success: true, disabled: true, deletedCount: 0, matchedCount, cutoff }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("cleanup-empty-orders error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
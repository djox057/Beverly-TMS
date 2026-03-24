import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: accept cron secret or service role key
    const authHeader = req.headers.get("authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (
      authHeader !== `Bearer ${cronSecret}` &&
      !authHeader?.includes(serviceRoleKey || "")
    ) {
      console.log("Unauthorized request");
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey!
    );

    // Get current Chicago date
    const now = new Date();
    const chicagoFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = chicagoFormatter.formatToParts(now);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    const todayStr = `${year}-${month}-${day}`;
    const todayEnd = `${todayStr} 23:59:59`;

    console.log(`cleanup-yard-arrivals: Chicago date=${todayStr}, cutoff=${todayEnd}`);

    // Delete checked maintenance/safety rows with arrival_datetime <= today end
    const { data: deletedRows, error: deleteError } = await supabase
      .from("driver_yard_actions")
      .delete()
      .in("action_type", ["maintenance", "safety"])
      .eq("is_checked", true)
      .lte("arrival_datetime", todayEnd)
      .select("driver_id");

    if (deleteError) {
      console.error("Error deleting yard actions:", deleteError);
      throw deleteError;
    }

    const deletedCount = deletedRows?.length || 0;
    console.log(`Deleted ${deletedCount} checked yard actions`);

    // Reset going_yard for affected drivers
    let driversUpdated = 0;
    if (deletedRows && deletedRows.length > 0) {
      const driverIds = [...new Set(deletedRows.map((r) => r.driver_id))];
      console.log(`Resetting going_yard for ${driverIds.length} drivers`);

      const { error: updateError } = await supabase
        .from("drivers")
        .update({ going_yard: false })
        .in("id", driverIds);

      if (updateError) {
        console.error("Error updating drivers:", updateError);
        throw updateError;
      }
      driversUpdated = driverIds.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        date: todayStr,
        deletedCount,
        driversUpdated,
        clearedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in cleanup-yard-arrivals:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

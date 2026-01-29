import { createClient } from "https://esm.sh/@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify cron secret for scheduled invocation
    const authHeader = req.headers.get("authorization");
    const cronSecret = Deno.env.get("CRON_SECRET");
    
    // Allow invocation via cron secret or service role
    if (authHeader !== `Bearer ${cronSecret}`) {
      // If not cron, verify it's a valid Supabase service role call
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!authHeader?.includes(supabaseKey || "")) {
        console.log("Unauthorized request - missing valid authorization");
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current Chicago time
    const now = new Date();
    const chicagoFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    const parts = chicagoFormatter.formatToParts(now);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value;
    
    const weekday = getPart("weekday"); // Mon, Tue, etc.
    const hour = parseInt(getPart("hour") || "0", 10);
    const minute = parseInt(getPart("minute") || "0", 10);
    const totalMinutes = hour * 60 + minute;

    console.log(`Current Chicago time: ${weekday} ${hour}:${minute} (${totalMinutes} minutes)`);

    // Only clear on Monday before 6:45 AM (6:44 AM or earlier = 404 minutes)
    // This runs every minute via cron, so check if it's Monday and before 6:45 AM
    if (weekday !== "Mon") {
      console.log("Not Monday, skipping clear");
      return new Response(
        JSON.stringify({ message: "Not Monday, skipping clear" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // 6:44 AM = 404 minutes
    if (totalMinutes !== 404) {
      console.log(`Not 6:44 AM (current: ${totalMinutes} minutes), skipping clear`);
      return new Response(
        JSON.stringify({ 
          message: `Not 6:44 AM (current: ${totalMinutes} minutes), skipping clear`,
          chicagoTime: `${hour}:${minute}`
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Clearing weekly plans for new week...");

    // Calculate the Monday of the current week
    const year = parseInt(getPart("year") || "2025", 10);
    const month = parseInt(getPart("month") || "1", 10) - 1; // JS months are 0-indexed
    const day = parseInt(getPart("day") || "1", 10);
    
    // Format as YYYY-MM-DD for the current Monday
    const weekStart = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    
    console.log(`Deleting plans for week starting: ${weekStart}`);

    // Delete all plans for the current week (they'll be recreated fresh)
    const { error, count } = await supabase
      .from("weekly_plans")
      .delete()
      .eq("week_start", weekStart);

    if (error) {
      console.error("Error deleting weekly plans:", error);
      throw error;
    }

    console.log(`Cleared ${count || 0} weekly plans`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Cleared weekly plans for ${weekStart}`,
        deletedCount: count || 0,
        clearedAt: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in clear-weekly-plans:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

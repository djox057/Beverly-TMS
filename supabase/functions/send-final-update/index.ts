import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { truckId, driverId, truckNumber, driverName, note } = await req.json();
    if (!truckId || !note || !String(note).trim()) {
      return new Response(JSON.stringify({ error: "Missing truckId or note" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Chicago date
    const chicagoNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Chicago" }));
    const y = chicagoNow.getFullYear();
    const m = String(chicagoNow.getMonth() + 1).padStart(2, "0");
    const d = String(chicagoNow.getDate()).padStart(2, "0");
    const sendDate = `${y}-${m}-${d}`;

    // Keep the existing endpoint/table names for compatibility. Final updates
    // are recorded for the Reports completion colors without sending emails.
    const { data: existing, error: lookupError } = await supabase
      .from("final_update_sends")
      .select("id")
      .eq("truck_id", truckId)
      .eq("send_date", sendDate)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) {
      return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insertError } = await supabase.from("final_update_sends").insert({
      truck_id: truckId,
      driver_id: driverId || null,
      send_date: sendDate,
      truck_number: truckNumber || null,
      driver_name: driverName || null,
      note: String(note).trim(),
    });
    if (insertError) throw insertError;

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
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
    const dateLabel = `${m}/${d}/${y}`;

    // Idempotency: skip if already sent today
    const { data: existing } = await supabase
      .from("final_update_sends")
      .select("id")
      .eq("truck_id", truckId)
      .eq("send_date", sendDate)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ success: true, skipped: "already_sent" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = `${dateLabel} ${truckNumber || ""} ${driverName || ""} final update`.trim();
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px">
        <h2 style="color:#b8860b;border-bottom:2px solid #b8860b;padding-bottom:8px">Final Update</h2>
        <p><strong>Date:</strong> ${dateLabel}</p>
        <p><strong>Truck:</strong> ${truckNumber || "-"}</p>
        <p><strong>Driver:</strong> ${driverName || "-"}</p>
        <div style="background:#fffbea;border:1px solid #facc15;border-radius:6px;padding:12px;margin-top:12px;white-space:pre-wrap">${String(note).replace(/[<>&]/g, c => ({"<":"&lt;",">":"&gt;","&":"&amp;"}[c] as string))}</div>
      </div>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Dispatch Alerts <jon@bfprime.net>",
        to: ["djordjeljubicicyt@gmail.com"],
        subject,
        html,
      }),
    });
    const emailJson = await emailRes.json();
    if (!emailRes.ok) {
      console.error("Resend error", emailJson);
      return new Response(JSON.stringify({ error: emailJson?.message || "email_failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("final_update_sends").insert({
      truck_id: truckId,
      driver_id: driverId || null,
      send_date: sendDate,
      truck_number: truckNumber || null,
      driver_name: driverName || null,
      note: String(note).trim(),
    });

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
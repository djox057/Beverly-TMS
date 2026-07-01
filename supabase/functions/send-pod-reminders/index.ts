import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function chicagoYesterdayISO(): string {
  // Get current Chicago date, subtract 1 day, return YYYY-MM-DD
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
  });
  const today = fmt.format(new Date()); // YYYY-MM-DD
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Format "2026-06-28T07:00:00+00:00" → "06/28/2026 07:00" (treat as naive wall time)
function formatDelivery(dt: string | null | undefined): string {
  if (!dt) return "";
  const m = String(dt).match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return String(dt);
  const [, y, mo, d, hh, mm] = m;
  return `${mo}/${d}/${y} ${hh}:${mm}`;
}

// Fine range: 30% if POD not uploaded within 24 hours, 50% after 48 hours.
// Base = freight*1% + (freight - driver_pay)*5%
function calcFineRange(freight: number, driverPay: number): { min: number; max: number } {
  const base = freight * 0.01 + (freight - driverPay) * 0.05;
  const positiveBase = Math.max(0, base);
  return { min: positiveBase * 0.30, max: positiveBase * 0.50 };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "1";

    // Only run at 12:00 Chicago time (skip duplicate CDT/CST cron entry)
    const chicagoHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago", hour: "2-digit", hour12: false,
      }).format(new Date()), 10,
    );
    if (!force && chicagoHour !== 12) {
      console.log(`⏭️ Skipping: Chicago hour is ${chicagoHour}, not 12`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, chicagoHour }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const yesterday = chicagoYesterdayISO();
    const start = `${yesterday} 00:00:00`;
    // Use exclusive end at next day 00:00 (Chicago naive)
    const endDate = new Date(yesterday + "T00:00:00Z");
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = `${endDate.toISOString().slice(0, 10)} 00:00:00`;

    console.log(`📅 POD reminder window (Chicago): ${start} → ${end}`);

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id, load_number, internal_load_number, status, delivery_datetime,
        pod_force_complete, driver_price, freight_amount, booked_by,
        truck_id, driver1_id,
        trucks:truck_id ( truck_number ),
        order_files ( file_category )
      `)
      .gte("delivery_datetime", start)
      .lt("delivery_datetime", end)
      .eq("canceled", false);

    if (error) throw error;

    // Filter out orders with POD or pod_force_complete
    const missing = (orders || []).filter((o: any) => {
      if (o.pod_force_complete) return false;
      // Skip yard/unassigned loads (no driver + no truck assigned) — these
      // are recovery loads waiting for a driver, no one to remind for POD.
      if (!o.driver1_id && !o.truck_id) return false;
      const files = o.order_files || [];
      return !files.some((f: any) => f.file_category === "POD");
    });

    // booked_by is the dispatcher's display name (text). Look up profiles by full_name.
    const bookerNames = Array.from(new Set(missing.map((o: any) => o.booked_by).filter(Boolean)));
    const bookerMap = new Map<string, { full_name: string | null; email: string | null }>();
    if (bookerNames.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("full_name, email")
        .in("full_name", bookerNames);
      for (const p of profs || []) {
        bookerMap.set((p as any).full_name, { full_name: (p as any).full_name, email: (p as any).email });
      }
    }

    // Group by booker (the dispatcher who booked the load)
    const byDispatcher = new Map<string, { name: string; email: string; orders: any[] }>();
    for (const o of missing) {
      const t: any = o.trucks;
      const p = o.booked_by ? bookerMap.get(o.booked_by) : null;
      if (!p?.email) continue;
      const key = p.email;
      if (!byDispatcher.has(key)) {
        byDispatcher.set(key, { name: p.full_name || "Dispatcher", email: p.email, orders: [] });
      }
      byDispatcher.get(key)!.orders.push({
        load_number: o.load_number,
        internal_load_number: o.internal_load_number,
        truck_number: t?.truck_number,
        delivery_datetime: o.delivery_datetime,
        driver_price: Number(o.driver_price) || 0,
        freight_amount: Number(o.freight_amount) || 0,
      });
    }

    console.log(`Found ${missing.length} missing-POD orders across ${byDispatcher.size} dispatchers`);

    const sent: any[] = [];

    for (const [, group] of byDispatcher) {
      const rows = group.orders.map((o) => {
        const { min, max } = calcFineRange(o.freight_amount, o.driver_price);
        const fine = `$${min.toFixed(2)} - $${max.toFixed(2)}`;
        return `
          <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">${o.internal_load_number || ""}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${o.load_number || ""}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${o.truck_number || ""}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;">${formatDelivery(o.delivery_datetime)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;color:#b91c1c;font-weight:bold;">${fine}</td>
          </tr>`;
      }).join("");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;">
          <h2 style="color:#f97316;border-bottom:2px solid #f97316;padding-bottom:10px;">
            📄 POD Upload Reminder
          </h2>
          <p>Hi ${group.name},</p>
          <p>The following load${group.orders.length > 1 ? "s were" : " was"} delivered yesterday but
            <strong>still ${group.orders.length > 1 ? "have" : "has"} no POD uploaded</strong>.</p>

          <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px;margin:14px 0;color:#9a3412;">
            ⚠️ Not uploading the POD within <strong>24 hours of delivery</strong> is a <strong>30% charge</strong>.
            Not uploading the POD within <strong>48 hours of delivery</strong> is a <strong>50% charge</strong>.
          </div>

          <table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px;">
            <thead>
              <tr style="background:#f9fafb;text-align:left;">
                <th style="padding:8px;border-bottom:2px solid #ddd;">Internal #</th>
                <th style="padding:8px;border-bottom:2px solid #ddd;">Load #</th>
                <th style="padding:8px;border-bottom:2px solid #ddd;">Truck</th>
                <th style="padding:8px;border-bottom:2px solid #ddd;">Delivery</th>
                <th style="padding:8px;border-bottom:2px solid #ddd;">Potential Fine (30% - 50%)</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>

          <p style="color:#666;font-size:12px;margin-top:24px;">
            Sent to: ${group.email}
          </p>
        </div>`;

      const subject = `🚨 POD Reminder: ${group.orders.length} load${group.orders.length > 1 ? "s" : ""} missing POD from yesterday`;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Dispatch Alerts <jon@bfprime.net>",
          to: [group.email],
          subject,
          html,
        }),
      });
      const body = await res.json();
      console.log(`Sent to ${group.email}:`, res.status, body?.id || body);
      sent.push({ dispatcher: group.email, count: group.orders.length, ok: res.ok, id: body?.id });
    }

    return new Response(
      JSON.stringify({ success: true, window: { start, end }, dispatchers: byDispatcher.size, totalOrders: missing.length, sent }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (err: any) {
    console.error("❌ send-pod-reminders error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
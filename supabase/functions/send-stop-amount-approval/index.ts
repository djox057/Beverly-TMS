import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.23.8";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  managerUserId: z.string().uuid(),
  loadNumber: z.string().trim().max(120).nullish(),
  brokerName: z.string().trim().max(200).nullish(),
  truckNumber: z.string().trim().max(50).nullish(),
  driverName: z.string().trim().max(200).nullish(),
  driverId: z.string().uuid().nullish(),
  orderId: z.string().uuid().nullish(),
  pickupDate: z.string().trim().max(40).nullish(),
  freightAmount: z.number().nonnegative(),
  stopAmount: z.number().nonnegative(),
  pickup: z.string().trim().max(300).nullish(),
  delivery: z.string().trim().max(300).nullish(),
  testTo: z.string().email().nullish(),
  serviceTest: z.boolean().nullish(),
});

const money = (n: number) => `$${n.toFixed(2)}`;

/** Monday–Sunday week (Chicago) containing the given date. */
const chicagoWeekRange = (value?: string | null) => {
  const base = value ? new Date(value) : new Date();
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(isNaN(base.getTime()) ? new Date() : base);
  const day = new Date(`${iso}T00:00:00Z`);
  const dow = day.getUTCDay(); // 0=Sun
  const offsetToMonday = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(day.getTime() + offsetToMonday * 86400000);
  const nextMonday = new Date(monday.getTime() + 7 * 86400000);
  return {
    startISO: monday.toISOString().slice(0, 10),
    endISO: nextMonday.toISOString().slice(0, 10),
  };
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceCall = bearer === serviceKey;

    let callerId: string | null = null;
    let callerEmail: string | null = null;
    if (!isServiceCall) {
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
      callerId = userData.user.id;
      callerEmail = userData.user.email ?? null;
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const b = parsed.data;

    const admin = createClient(supabaseUrl, serviceKey);

    const [{ data: managerProfile }, { data: requesterProfile }] = await Promise.all([
      admin.from("profiles").select("full_name, email, office").eq("user_id", b.managerUserId).maybeSingle(),
      callerId
        ? admin.from("profiles").select("full_name, email, office").eq("user_id", callerId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    if (!managerProfile?.email) {
      return new Response(JSON.stringify({ error: "Selected manager has no email on file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pct = b.freightAmount > 0 ? (b.stopAmount / b.freightAmount) * 100 : 0;
    const requesterName = requesterProfile?.full_name || callerEmail || "Dispatcher";

    // Resolve driver: prefer the supplied name, otherwise derive from the truck.
    let driverId = b.driverId || null;
    let driverName = b.driverName || null;
    if (!driverId && b.truckNumber) {
      const { data: truckRow } = await admin
        .from("trucks")
        .select("driver1_id")
        .eq("truck_number", b.truckNumber)
        .maybeSingle();
      driverId = truckRow?.driver1_id || null;
    }
    if (driverId && !driverName) {
      const { data: driverRow } = await admin
        .from("drivers")
        .select("full_name")
        .eq("id", driverId)
        .maybeSingle();
      driverName = driverRow?.full_name || null;
    }

    // Weekly (Mon–Sun Chicago) totals for that driver, including this load.
    const { startISO, endISO } = chicagoWeekRange(b.pickupDate);
    let weekFreight = b.freightAmount;
    let weekStop = b.stopAmount;
    if (driverId) {
      const { data: weekOrders } = await admin
        .from("orders")
        .select("id, load_number, freight_amount, driver_price")
        .eq("driver1_id", driverId)
        .eq("canceled", false)
        .gte("pickup_datetime", `${startISO}T00:00:00`)
        .lt("pickup_datetime", `${endISO}T00:00:00`);
      // Start from the queried week and add this load only if it is not already stored.
      weekFreight = 0;
      weekStop = 0;
      let includesThisLoad = false;
      for (const o of weekOrders || []) {
        if (
          (b.orderId && o.id === b.orderId) ||
          (b.loadNumber && o.load_number && String(o.load_number).trim() === b.loadNumber.trim())
        ) {
          includesThisLoad = true;
        }
        weekFreight += Number(o.freight_amount) || 0;
        weekStop += Number(o.driver_price) || 0;
      }
      // If the caller sent an orderId, the load is already persisted — never add it again,
      // even if its pickup date falls outside the queried week.
      if (!includesThisLoad && !b.orderId) {
        weekFreight += b.freightAmount;
        weekStop += b.stopAmount;
      }
    }
    const weekLabel = `${startISO} – ${endISO}`;

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
        <h2 style="margin:0 0 12px">Low Stop Amount Approval</h2>
        <p><strong>${requesterName}</strong>${requesterProfile?.office ? ` (${requesterProfile.office})` : ""}
        booked a load with a Stop Amount below 90% of the Freight Amount and selected you as the approving manager.</p>
        <table cellpadding="6" style="border-collapse:collapse">
          <tr><td><strong>Load #</strong></td><td>${b.loadNumber || "-"}</td></tr>
          <tr><td><strong>Broker</strong></td><td>${b.brokerName || "-"}</td></tr>
          <tr><td><strong>Truck</strong></td><td>${b.truckNumber || "-"}</td></tr>
          <tr><td><strong>Driver</strong></td><td>${driverName || "-"}</td></tr>
          <tr><td><strong>Pickup</strong></td><td>${b.pickup || "-"}</td></tr>
          <tr><td><strong>Delivery</strong></td><td>${b.delivery || "-"}</td></tr>
          <tr><td><strong>Freight Amount</strong></td><td>${money(b.freightAmount)} <span style="color:#555">(week total: ${money(weekFreight)})</span></td></tr>
          <tr><td><strong>Stop Amount</strong></td><td style="color:#b91c1c">${money(b.stopAmount)} (${pct.toFixed(1)}% of freight) <span style="color:#555">(week total: ${money(weekStop)})</span></td></tr>
          <tr><td><strong>90% Floor</strong></td><td>${money(b.freightAmount * 0.9)}</td></tr>
          <tr><td><strong>Week (Mon–Sun)</strong></td><td>${weekLabel}</td></tr>
        </table>
        <p style="margin-top:14px">The load has been created. Reply to this email if this approval is not correct.</p>
      </div>`;

    const response = await resend.emails.send({
      from: "Dispatch <dispatch@bfprime.net>",
      to: b.testTo ? [b.testTo] : [managerProfile.email],
      ...(!b.testTo && requesterProfile?.email
        ? { cc: [requesterProfile.email], replyTo: [requesterProfile.email] }
        : {}),
      subject: `Low Stop Amount Approval - Load ${b.loadNumber || ""} (${money(b.stopAmount)} / ${money(b.freightAmount)})`,
      html,
    });

    const errorMessage = (response as any)?.error?.message || null;
    if (errorMessage) {
      console.error("Resend error:", errorMessage);
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, sentTo: managerProfile.email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-stop-amount-approval:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);

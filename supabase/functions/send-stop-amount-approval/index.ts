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
  freightAmount: z.number().nonnegative(),
  stopAmount: z.number().nonnegative(),
  pickup: z.string().trim().max(300).nullish(),
  delivery: z.string().trim().max(300).nullish(),
});

const money = (n: number) => `$${n.toFixed(2)}`;

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

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const b = parsed.data;

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const [{ data: managerProfile }, { data: requesterProfile }] = await Promise.all([
      admin.from("profiles").select("full_name, email, office").eq("user_id", b.managerUserId).maybeSingle(),
      admin.from("profiles").select("full_name, email, office").eq("user_id", userData.user.id).maybeSingle(),
    ]);

    if (!managerProfile?.email) {
      return new Response(JSON.stringify({ error: "Selected manager has no email on file" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pct = b.freightAmount > 0 ? (b.stopAmount / b.freightAmount) * 100 : 0;
    const requesterName = requesterProfile?.full_name || userData.user.email || "Dispatcher";

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
        <h2 style="margin:0 0 12px">Low Stop Amount Approval</h2>
        <p><strong>${requesterName}</strong>${requesterProfile?.office ? ` (${requesterProfile.office})` : ""}
        booked a load with a Stop Amount below 90% of the Freight Amount and selected you as the approving manager.</p>
        <table cellpadding="6" style="border-collapse:collapse">
          <tr><td><strong>Load #</strong></td><td>${b.loadNumber || "-"}</td></tr>
          <tr><td><strong>Broker</strong></td><td>${b.brokerName || "-"}</td></tr>
          <tr><td><strong>Truck / Driver</strong></td><td>${b.truckNumber || "-"} / ${b.driverName || "-"}</td></tr>
          <tr><td><strong>Pickup</strong></td><td>${b.pickup || "-"}</td></tr>
          <tr><td><strong>Delivery</strong></td><td>${b.delivery || "-"}</td></tr>
          <tr><td><strong>Freight Amount</strong></td><td>${money(b.freightAmount)}</td></tr>
          <tr><td><strong>Stop Amount</strong></td><td style="color:#b91c1c">${money(b.stopAmount)} (${pct.toFixed(1)}% of freight)</td></tr>
          <tr><td><strong>90% Floor</strong></td><td>${money(b.freightAmount * 0.9)}</td></tr>
        </table>
        <p style="margin-top:14px">The load has been created. Reply to this email if this approval is not correct.</p>
      </div>`;

    const response = await resend.emails.send({
      from: "Dispatch <dispatch@bfprime.net>",
      to: [managerProfile.email],
      ...(requesterProfile?.email ? { cc: [requesterProfile.email], replyTo: [requesterProfile.email] } : {}),
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

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_TO = ["bob.i@bfprime.net", "anya@bfprime.net"];
const SMS_TO = ["+18477093144", "+15743079893"];
const FROM = "Dispatch <dispatch@bfprime.net>";

const escapeHtml = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface Body {
  truckNumber?: string | null;
  uploadedBy?: string | null;
  documents: Array<{ docLabel: string; fileName: string }>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const body = (await req.json()) as Body;
    const docs = (body.documents || []).filter((d) => d && d.fileName);
    if (docs.length === 0) {
      return new Response(JSON.stringify({ error: "No documents provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const truckLabel = body.truckNumber ? `Truck #${body.truckNumber}` : "Truck";
    const types = [...new Set(docs.map((d) => d.docLabel))].join(" / ");
    const subject = `${types} document uploaded — ${truckLabel}`;

    const rows = docs
      .map(
        (d) =>
          `<tr><td style="padding:4px 10px;border:1px solid #ddd;">${escapeHtml(d.docLabel)}</td><td style="padding:4px 10px;border:1px solid #ddd;">${escapeHtml(d.fileName)}</td></tr>`,
      )
      .join("");

    const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">
        <p><strong>${escapeHtml(subject)}</strong></p>
        <p>Uploaded by: ${escapeHtml(body.uploadedBy || "unknown")}</p>
        <table style="border-collapse:collapse;">
          <tr><th style="padding:4px 10px;border:1px solid #ddd;text-align:left;">Document</th><th style="padding:4px 10px;border:1px solid #ddd;text-align:left;">File</th></tr>
          ${rows}
        </table>
      </div>`;

    const results: Record<string, unknown> = {};

    // Email
    try {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      const emailRes = await resend.emails.send({
        from: FROM,
        to: EMAIL_TO,
        subject,
        html,
      });
      results.email = emailRes;
    } catch (e) {
      console.error("Email failed:", e);
      results.email = { error: String(e) };
    }

    // SMS via RingCentral
    try {
      const CLIENT_ID = Deno.env.get("RINGCENTRAL_CLIENT_ID");
      const CLIENT_SECRET = Deno.env.get("RINGCENTRAL_CLIENT_SECRET");
      const JWT_TOKEN = Deno.env.get("RINGCENTRAL_JWT_TOKEN");
      const SERVER_URL = Deno.env.get("RINGCENTRAL_SERVER_URL") || "https://platform.ringcentral.com";
      const FROM_NUMBER = Deno.env.get("RINGCENTRAL_PHONE_NUMBER");

      if (!CLIENT_ID || !CLIENT_SECRET || !JWT_TOKEN || !FROM_NUMBER) {
        throw new Error("Missing RingCentral credentials");
      }

      const authRes = await fetch(`${SERVER_URL}/restapi/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
        },
        body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${JWT_TOKEN}`,
      });
      if (!authRes.ok) throw new Error(`RingCentral auth failed: ${await authRes.text()}`);
      const { access_token } = await authRes.json();

      const text = `${types} uploaded for ${truckLabel}: ${docs.map((d) => d.fileName).join(", ")}`;
      const smsResults = [];
      for (const to of SMS_TO) {
        const smsRes = await fetch(`${SERVER_URL}/restapi/v1.0/account/~/extension/~/sms`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: { phoneNumber: FROM_NUMBER },
            to: [{ phoneNumber: to }],
            text,
          }),
        });
        smsResults.push({ to, ok: smsRes.ok, detail: smsRes.ok ? undefined : await smsRes.text() });
      }
      results.sms = smsResults;
    } catch (e) {
      console.error("SMS failed:", e);
      results.sms = { error: String(e) };
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("notify-truck-device-doc error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

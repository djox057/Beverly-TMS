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
  brokerName: z.string().trim().min(1).max(200),
  brokerEmail: z.string().trim().email().max(255),
  brokerAddress: z.string().trim().min(1).max(500),
  bookedByCompanyName: z.string().trim().max(200).nullish(),
});

const WORLD = "Futurecertificates@worldinsurance.com";
const ATS = "COI@atsinsure.com";

// Map booked-by company name to the dispatch sender + recipients
const resolveRouting = (companyName: string | null | undefined) => {
  const normalized = (companyName || "").toUpperCase();

  if (normalized.includes("BEVERLY FREIGHT")) {
    return { from: "dispatch@beverlyfreight.net", to: [WORLD] };
  }
  if (normalized.includes("UNITED ENTERPRISE")) {
    return { from: "Dispatch@unitedenterprisesolutions.net", to: [WORLD] };
  }
  if (normalized.includes("AP SILVER")) {
    return { from: "dispatch@apsilvertrans.net", to: [WORLD] };
  }
  if (normalized.includes("BG PRIME") || normalized.includes("BEVERLY GROUP")) {
    return { from: "dispatch@bgprime.net", to: [WORLD] };
  }
  // BF Prime (and any unknown/fallback company) goes to both insurers
  return { from: "dispatch@bfprime.net", to: [ATS, WORLD] };
};

// zane@bfprime.net + dispatch@bgprime.net -> zane@bgprime.net
const buildCcAddress = (requesterEmail: string | null | undefined, fromEmail: string): string | null => {
  if (!requesterEmail || !requesterEmail.includes("@")) return null;
  const localPart = requesterEmail.split("@")[0];
  const domain = fromEmail.split("@")[1];
  if (!localPart || !domain) return null;
  return `${localPart}@${domain}`;
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
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

    const { brokerName, brokerEmail, brokerAddress, bookedByCompanyName } = parsed.data;

    const { from: fromEmail, to } = resolveRouting(bookedByCompanyName);
    const requesterEmail = userData.user.email ?? null;
    const ccAddress = buildCcAddress(requesterEmail, fromEmail);

    const emailBody = `Please put this broker as a Certificate Holder and email it to ${brokerEmail}:

${brokerName}
${brokerAddress}`;

    console.log("Sending COI request:", { fromEmail, to, ccAddress, bookedByCompanyName });

    const emailResponse = await resend.emails.send({
      from: `Dispatch <${fromEmail}>`,
      to,
      ...(ccAddress ? { cc: [ccAddress] } : {}),
      replyTo: ccAddress ? [ccAddress, fromEmail] : [fromEmail],
      subject: `COI Request - ${brokerName}`,
      text: emailBody,
    });

    if ((emailResponse as any)?.error) {
      console.error("Resend error:", (emailResponse as any).error);
      return new Response(
        JSON.stringify({ success: false, error: (emailResponse as any).error?.message || "Failed to send email" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("COI email sent:", emailResponse);

    const confirmationMessage = `COI Request Sent

From: ${fromEmail}
To: ${to.join(", ")}${ccAddress ? `\nCC: ${ccAddress}` : ""}
Subject: COI Request - ${brokerName}

${emailBody}`;

    return new Response(JSON.stringify({ success: true, confirmationMessage }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-coi-request function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
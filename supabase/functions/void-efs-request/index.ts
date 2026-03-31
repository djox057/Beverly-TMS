import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VoidEfsRequest {
  requestId: string;
  source: 'efs' | 'cash_advance';
  driverName: string;
  truckNumber: string;
  amount: number;
  purpose: string;
  requestedByName: string | null;
}

// Extract last word from name
function getLastNamePart(fullName: string | null | undefined): string {
  if (!fullName) return "App";
  const parts = fullName.trim().split(/[\s-]+/);
  return parts[parts.length - 1] || "App";
}

// Map company name to EFS sender email
function getEfsEmail(companyName: string | null): string {
  if (!companyName) return "efs@bfprime.net";
  const normalized = companyName.toUpperCase();
  if (normalized.includes("BEVERLY FREIGHT")) return "efs@beverlyfreight.net";
  if (normalized.includes("BF PRIME UNITED")) return "efs@bfprimeunited.net";
  if (normalized.includes("UNITED ENTERPRISE")) return "efs@unitedenterprisesolutions.net";
  if (normalized.includes("BG PRIME")) return "efs@bgprime.net";
  if (normalized.includes("BF PRIME")) return "efs@bfprime.net";
  if (normalized.includes("BEVERLY GROUP")) return "efs@bfprime.net";
  if (normalized.includes("AP SILVER")) return "efs@apsilvertrans.net";
  return "efs@bfprime.net";
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: VoidEfsRequest = await req.json();
    const { requestId, source, driverName, truckNumber, amount, purpose, requestedByName } = body;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service-role client to look up original record
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the original record to get company_name and resend_email_id
    let companyName: string | null = null;
    let resendEmailId: string | null = null;

    if (source === 'efs') {
      const { data } = await supabaseAdmin
        .from("efs_other_requests")
        .select("company_name, resend_email_id")
        .eq("id", requestId)
        .single();
      if (data) {
        companyName = data.company_name;
        resendEmailId = data.resend_email_id;
      }
    } else {
      // cash_advance — join to drivers for company_name
      const { data } = await supabaseAdmin
        .from("driver_cash_advances")
        .select("resend_email_id, drivers(company_name)")
        .eq("id", requestId)
        .single();
      if (data) {
        resendEmailId = data.resend_email_id;
        companyName = (data.drivers as any)?.company_name || null;
      }
    }

    console.log("Looked up record:", { requestId, source, companyName, resendEmailId });

    // Resolve caller email from JWT for BCC
    let callerEmail: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await supabaseAuth.auth.getUser();
      if (userData?.user?.email) {
        callerEmail = userData.user.email;
      }
    }

    const fromEmail = getEfsEmail(companyName);
    console.log("Resolved fromEmail:", fromEmail, "from companyName:", companyName);
    const lastNamePart = getLastNamePart(requestedByName);

    const emailPayload: Record<string, any> = {
      from: `EFS Request <${fromEmail}>`,
      to: ["efsrequest@gmail.com"],
      ...(callerEmail ? { bcc: [callerEmail] } : {}),
      reply_to: callerEmail ? [callerEmail, fromEmail] : [fromEmail],
      subject: `Re: EFS request by ${lastNamePart}`,
      text: "Please void this",
    };

    // Add threading headers only when we have the original email ID
    if (resendEmailId) {
      const messageId = `<${resendEmailId}@resend.dev>`;
      emailPayload.headers = {
        "In-Reply-To": messageId,
        "References": messageId,
      };
    }

    console.log("Sending void email:", { resendEmailId, fromEmail, lastNamePart, callerEmail });

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    const emailResultText = await emailResponse.text();
    let emailResult: any = null;
    try {
      emailResult = emailResultText ? JSON.parse(emailResultText) : null;
    } catch {
      emailResult = { raw: emailResultText };
    }

    console.log("Void email response:", { ok: emailResponse.ok, status: emailResponse.status, result: emailResult });

    if (!emailResponse.ok) {
      const errorMsg = emailResult?.message || emailResult?.error?.message || `Resend error ${emailResponse.status}`;
      return new Response(
        JSON.stringify({ success: false, error: `Void email failed: ${errorMsg}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Void email sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in void-efs-request:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

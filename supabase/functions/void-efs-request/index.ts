import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VoidEfsRequest {
  resendEmailId: string;
  driverName: string;
  truckNumber: string;
  amount: number;
  purpose: string;
  companyName: string | null;
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
    const { resendEmailId, driverName, truckNumber, amount, purpose, companyName, requestedByName } = body;

    if (!resendEmailId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing resendEmailId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fromEmail = getEfsEmail(companyName);
    const lastNamePart = getLastNamePart(requestedByName);
    const messageId = `<${resendEmailId}@resend.dev>`;

    const emailPayload = {
      from: `EFS Request <${fromEmail}>`,
      to: ["efsrequest@gmail.com"],
      subject: `Re: EFS request by ${lastNamePart}`,
      text: "Please void this",
      headers: {
        "In-Reply-To": messageId,
        "References": messageId,
      },
    };

    console.log("Sending void email:", { resendEmailId, fromEmail, lastNamePart });

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

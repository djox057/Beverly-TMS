import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EfsOtherRequest {
  driverId?: string;
  driverName: string;
  truckNumber: string;
  companyName: string;
  amount: number;
  purpose: string;
  requesterEmail?: string;
  requesterName?: string;
  // Fuel-specific fields
  city?: string;
  state?: string;
  quantity?: number;
  receiptPath?: string;
}

// Extract last word from name (e.g., "David Mijailovic-Dom" -> "Dom")
function getLastNamePart(fullName: string | undefined): string {
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

// Map company name to short code for transaction number
function getCompanyCode(companyName: string | null): string {
  if (!companyName) return "BFP";
  const normalized = companyName.toUpperCase();
  if (normalized.includes("BEVERLY FREIGHT")) return "BEV";
  if (normalized.includes("BF PRIME UNITED")) return "BPU";
  if (normalized.includes("BG PRIME")) return "BGP";
  if (normalized.includes("BF PRIME")) return "BFP";
  if (normalized.includes("BEVERLY GROUP")) return "BG";
  if (normalized.includes("AP SILVER")) return "AST";
  return "BFP";
}

// Send email via Resend with retry on transient failures (408, 429, 5xx, network).
// Returns the final fetch Response (after retries) or throws on persistent network error.
async function sendResendEmailWithRetry(
  resendApiKey: string,
  payload: Record<string, any>,
  maxAttempts = 3,
  backoffMs = 600,
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const transient =
        resp.status === 408 ||
        resp.status === 429 ||
        (resp.status >= 500 && resp.status <= 599);
      if (!transient || attempt === maxAttempts) return resp;
      console.warn(`Resend transient ${resp.status} on attempt ${attempt}, retrying...`);
    } catch (err) {
      lastError = err;
      console.warn(`Resend network error on attempt ${attempt}:`, err);
      if (attempt === maxAttempts) throw err;
    }
    await new Promise((r) => setTimeout(r, backoffMs));
  }
  // Unreachable, but for type safety
  throw lastError ?? new Error("Resend send failed");
}

// Map a Resend error response to a clear, status-aware user message.
function mapResendErrorMessage(
  status: number,
  result: any,
  fromEmail: string,
): string {
  const raw = result?.message || result?.error?.message || "";
  if (status === 408) return "Email service timed out. Please try again in a moment.";
  if (status === 429) return "Email service is rate-limited. Please retry shortly.";
  if (status >= 500) return "Email service is temporarily unavailable. Please try again.";
  if (status === 401 || status === 403) return "Email service rejected the request (auth). Contact admin.";
  if (status === 422 && /domain|verify|from/i.test(raw)) {
    return `${raw || "Invalid sender"}. Sender domain "${fromEmail}" may need to be verified in Resend.`;
  }
  return raw || `Email service error (${status}).`;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EfsOtherRequest = await req.json();
    const { driverId, driverName, truckNumber, companyName, amount, purpose, city, state, quantity, receiptPath } = body;

    // Prefer resolving requester identity from the JWT
    let requesterEmail = body.requesterEmail;
    let requesterName = body.requesterName;
    let requesterId: string | null = null;

    console.log("EFS Other request received:", {
      driverId,
      driverName,
      truckNumber,
      companyName,
      amount,
      purpose,
      city,
      state,
      quantity,
      receiptPath,
      requesterEmail,
      requesterName,
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Resolve requester from JWT (role-independent)
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      });

      const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
      if (userError) {
        console.warn("Could not resolve requester from JWT:", userError);
      } else if (userData?.user) {
        requesterId = userData.user.id;
        requesterEmail = userData.user.email ?? requesterEmail;
        requesterName = (userData.user.user_metadata as any)?.full_name ?? requesterName;

        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: requesterProfile, error: requesterProfileError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", userData.user.id)
          .maybeSingle();

        if (requesterProfileError) {
          console.warn("Failed to fetch requester profile:", requesterProfileError);
        } else {
          requesterName = requesterProfile?.full_name || requesterName;
        }
      }
    }

    console.log("Requester resolved:", { requesterEmail, requesterName, requesterId });

    // Validate required fields
    if (!driverName || !truckNumber || amount === undefined || !purpose) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate amount
    if (amount < 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Amount must be positive" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if this is a fuel request
    const isFuelRequest = purpose.toLowerCase() === "fuel";

    // Validate fuel-specific fields (city and state required, quantity is optional)
    if (isFuelRequest) {
      if (!city || !state) {
        return new Response(
          JSON.stringify({ success: false, error: "Fuel requests require city and state" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Format the email body
    let emailBody = `Unit: ${truckNumber || "N/A"}
Driver: ${driverName}
Amount: $${amount.toFixed(2)}
Purpose: ${purpose}`;

    if (isFuelRequest && city && state) {
      emailBody += `
Location: ${city}, ${state}`;
    }

    // Determine sender email based on company
    const fromEmail = getEfsEmail(companyName);

    console.log("Sending EFS email from:", fromEmail);
    console.log("Email body:", emailBody);

    // Send email using Resend REST API
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("Missing RESEND_API_KEY");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service is not configured (missing RESEND_API_KEY).",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const lastNamePart = getLastNamePart(requesterName);
    const emailPayload = {
      from: `EFS Request <${fromEmail}>`,
      to: ["efsrequest@gmail.com"],
      ...(requesterEmail ? { bcc: [requesterEmail] } : {}),
      reply_to: requesterEmail ? [requesterEmail, fromEmail] : [fromEmail],
      subject: `EFS request by ${lastNamePart}`,
      text: emailBody,
    };

    let emailResponse: Response;
    try {
      emailResponse = await sendResendEmailWithRetry(resendApiKey, emailPayload);
    } catch (networkErr: any) {
      console.error("Resend network failure after retries:", networkErr);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service is unreachable. Please try again in a moment.",
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailResultText = await emailResponse.text();
    let emailResult: any = null;
    try {
      emailResult = emailResultText ? JSON.parse(emailResultText) : null;
    } catch {
      emailResult = { raw: emailResultText };
    }

    console.log("Resend response:", { ok: emailResponse.ok, status: emailResponse.status, result: emailResult });

    if (!emailResponse.ok) {
      console.error("Resend API error:", { status: emailResponse.status, result: emailResult, fromEmail });
      const userMessage = mapResendErrorMessage(emailResponse.status, emailResult, fromEmail);
      return new Response(
        JSON.stringify({
          success: false,
          error: userMessage,
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Email sent successfully:", emailResult);

    // Save to database (include resend email ID for threading void replies)
    const resendEmailId = emailResult?.id || null;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: dbError } = await supabase.from("efs_other_requests").insert({
      driver_id: driverId || null,
      driver_name: driverName,
      truck_number: truckNumber,
      company_name: companyName,
      amount: amount,
      purpose: purpose,
      requested_by: requesterName || requesterEmail || null,
      city: city || null,
      state: state || null,
      quantity: quantity || null,
      receipt_path: receiptPath || null,
      resend_email_id: resendEmailId,
    });

    if (dbError) {
      console.error("Failed to save EFS request to database:", dbError);
      // Don't fail the request, email was already sent
    } else {
      console.log("EFS request saved to database");
    }

    // If it's a fuel request with quantity, also create a fuel transaction record
    if (isFuelRequest && city && state && quantity && quantity > 0) {
      const today = new Date();
      const transactionDate = today.toISOString().split('T')[0];
      const companyCode = getCompanyCode(companyName);
      const transactionNumber = `EFS-${companyCode}-${Date.now()}`;
      
      // Calculate unit price from amount and quantity
      const unitPrice = quantity > 0 ? amount / quantity : 0;

      const fuelTransactionData = {
        truck_number: truckNumber,
        driver_name: driverName,
        transaction_number: transactionNumber,
        transaction_date: transactionDate,
        location_name: `EFS Request`,
        city: city,
        state: state.toUpperCase(),
        fees: 0,
        item: "ULSD", // Default to Ultra Low Sulfur Diesel
        unit_price: unitPrice,
        quantity: quantity,
        amount: amount,
        company: companyName,
        uploaded_by: requesterId,
        paid: false,
      };

      console.log("Creating fuel transaction:", fuelTransactionData);

      const { error: fuelError } = await supabase
        .from("fuel_transactions")
        .insert(fuelTransactionData);

      if (fuelError) {
        console.error("Failed to create fuel transaction:", fuelError);
        // Don't fail the request, EFS email was already sent
      } else {
        console.log("Fuel transaction created successfully");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "EFS request sent successfully",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-efs-other-request:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EfsRequestBody {
  orderId: string;
  lumperAmount: number;
  truckNumber: string;
  driverName: string;
  loadNumber: string;
  companyName: string;
  requesterEmail?: string;
  requesterName?: string;
}

// Extract last word from name (e.g., "David Mijailovic-Dom" -> "Dom")
function getLastNamePart(fullName: string | undefined): string {
  if (!fullName) return "App";
  // Split by space first, then by hyphen to get the very last part
  const parts = fullName.trim().split(/[\s-]+/);
  return parts[parts.length - 1] || "App";
}

// Map company name to EFS sender email
const getEfsEmail = (companyName: string | null): string => {
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
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: EfsRequestBody = await req.json();
    const { orderId, lumperAmount, truckNumber, driverName, loadNumber, companyName } = body;

    // Prefer resolving requester identity from the JWT (more reliable than client-provided fields)
    let requesterEmail = body.requesterEmail;
    let requesterName = body.requesterName;

    console.log("EFS Request received:", { orderId, lumperAmount, truckNumber, driverName, loadNumber, companyName, requesterEmail });

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

    console.log("Requester resolved:", { requesterEmail, requesterName });

    // Validate required fields
    if (!orderId || !lumperAmount || !truckNumber || !driverName || !loadNumber) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Format the email body
    const emailBody = `Unit #${truckNumber}
Driver ${driverName}
Amount $${lumperAmount.toFixed(2)}
Purpose Lumper fee`;

    // Determine sender email based on company
    const fromEmail = getEfsEmail(companyName);

    console.log("Sending EFS email from:", fromEmail);

    // Send email via Resend with BCC to requester and Reply-To for both dispatcher and company EFS
    const lastNamePart = getLastNamePart(requesterName);
    const emailResponse = await resend.emails.send({
      from: `EFS Request <${fromEmail}>`,
      to: ["efsrequest@gmail.com"],
      ...(requesterEmail ? { bcc: [requesterEmail] } : {}),
      replyTo: requesterEmail ? [requesterEmail, fromEmail] : [fromEmail],
      subject: `EFS request by ${lastNamePart}`,
      text: emailBody,
    });

    console.log("Email sent successfully:", emailResponse);

    // Update the order's lumper field in the database
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get current lumper value and add to it
    const { data: order, error: fetchError } = await supabaseAdmin
      .from("orders")
      .select("lumper")
      .eq("id", orderId)
      .single();

    if (fetchError) {
      console.error("Error fetching order:", fetchError);
      throw new Error(`Failed to fetch order: ${fetchError.message}`);
    }

    const currentLumper = order?.lumper || 0;
    const newLumper = currentLumper + lumperAmount;

    const { error: updateError } = await supabaseAdmin
      .from("orders")
      .update({ lumper: newLumper })
      .eq("id", orderId);

    if (updateError) {
      console.error("Error updating order lumper:", updateError);
      throw new Error(`Failed to update lumper: ${updateError.message}`);
    }

    console.log("Order lumper updated from", currentLumper, "to", newLumper);

    // Return success with the confirmation message
    const confirmationMessage = `EFS Money Code

Unit #${truckNumber}
Driver ${driverName}
Amount $${lumperAmount.toFixed(2)}
Purpose Lumper fee
load #${loadNumber}`;

    return new Response(
      JSON.stringify({ 
        success: true, 
        confirmationMessage,
        emailSent: true,
        newLumperAmount: newLumper
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-efs-request function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);

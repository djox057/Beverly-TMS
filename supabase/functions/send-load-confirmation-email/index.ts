import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Allow-list of legitimate sender addresses (must match company email config)
const ALLOWED_SENDER_EMAILS = new Set([
  "truckload@bfprime.net",
  "dispatch@bfprime.net",
  "truckload@bfprimeunited.net",
  "dispatch@bfprimeunited.net",
  "truckload@beverlygroupllc.net",
  "dispatch@beverlygroupllc.net",
  "truckload@beverlyfreight.net",
  "dispatch@beverlyfreight.net",
  "truckload@bgprime.net",
  "dispatch@bgprime.net",
  "truckload@unitedenterprisesolutions.net",
  "dispatch@unitedenterprisesolutions.net",
  "truckload@apsilvertrans.net",
  "dispatch@apsilvertrans.net",
]);

function extractEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return (m ? m[1] : addr).trim().toLowerCase();
}

interface EmailRequest {
  to: string | string[];
  from: string;
  cc: string;
  subject: string;
  bodyText: string;
  attachmentBase64: string;
  attachmentFilename: string;
  attachmentContentType: string;
}

// Escape HTML special characters to prevent XSS
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Auth check ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      to,
      from,
      cc,
      subject,
      bodyText,
      attachmentBase64,
      attachmentFilename,
      attachmentContentType,
    }: EmailRequest = await req.json();

    // Validate sender against allow-list to prevent phishing/spoofing
    if (!from || !ALLOWED_SENDER_EMAILS.has(extractEmail(from))) {
      console.error("❌ Rejected sender (not in allow-list):", from);
      return new Response(JSON.stringify({ error: "Sender address not permitted" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("📧 ========================================");
    console.log("📧 EMAIL REQUEST RECEIVED");
    console.log("📧 ========================================");
    console.log(`📧 To: ${to}`);
    console.log(`📧 From: ${from}`);
    console.log(`📧 CC: ${cc}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Attachment: ${attachmentFilename}`);
    console.log(`📧 Attachment Type: ${attachmentContentType}`);
    console.log(`📧 Body Text length: ${bodyText?.length || 0}`);
    console.log(`📧 Base64 length: ${attachmentBase64?.length || 0}`);
    console.log("📧 ========================================");

    // Validate required fields
    if (!to || !from || !subject) {
      throw new Error("Missing required fields: to, from, or subject");
    }

    // Validate bodyText length to prevent abuse
    if (bodyText && bodyText.length > 5000) {
      throw new Error("Body text exceeds maximum length of 5000 characters");
    }

    // Build email HTML with escaped bodyText
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <div style="border: 1px solid #1d4ed8; background-color: #eff6ff; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <p style="font-size: 15px; font-weight: bold; color: #1e3a8a; margin: 0 0 10px 0;">
            EFS Fuel card instructions and daily limits
          </p>
          <ul style="font-size: 14px; color: #1e3a8a; margin: 0 0 12px 0; padding-left: 20px;">
            <li>Love&rsquo;s &ndash; 250 gallons</li>
            <li>TA/Petro &ndash; 250 gallons</li>
            <li>Road Ranger &ndash; 250 gallons</li>
            <li>Pilot, Flying J, and other smaller truck stops &ndash; 50 gallons <em>(diesel only, DEFD is not available, and fuel discounts do not apply at these locations)</em></li>
          </ul>
          <div style="border-top: 1px solid #bfdbfe; margin-top: 12px; padding-top: 12px;">
            <p style="font-size: 15px; font-weight: bold; color: #1e3a8a; margin: 0 0 8px 0;">
              Scale Services
            </p>
            <p style="font-size: 14px; color: #1e3a8a; margin: 0;">
              Available at any CAT scale location. Scale tickets are charged at standard location rates — there is currently no discount program for scale services.
            </p>
          </div>
        </div>
        <p style="font-size: 16px; color: #333;">
          ${escapeHtml(bodyText)}
        </p>
        <br/>
        <div style="border-top: 2px solid #cc0000; margin-top: 20px; padding-top: 16px;">
          <p style="font-size: 15px; font-weight: bold; color: #cc0000; margin-bottom: 10px;">
            IMPORTANT – LOAD SECURITY REQUIREMENT
          </p>
          <p style="font-size: 14px; color: #333; margin-bottom: 8px;">
            For all loads, the following is mandatory:
          </p>
          <ul style="font-size: 14px; color: #333; margin-bottom: 12px; padding-left: 20px;">
            <li>A padlock and seal must be applied immediately after leaving the shipper</li>
            <li>You must take a clear photo as proof after sealing the trailer</li>
            <li>You must also take a photo before arriving at the receiver to confirm the seal is intact</li>
            <li>You must send the BOL (Bill of Lading) before leaving the shipper</li>
            <li>You must send the signed POD (Proof of Delivery) before leaving the receiver</li>
          </ul>
          <p style="font-size: 14px; color: #333; margin-bottom: 8px;">Additionally:</p>
          <ul style="font-size: 14px; color: #333; margin-bottom: 12px; padding-left: 20px;">
            <li>The seal number must be verified and match documentation</li>
            <li>Drivers are responsible for ensuring the trailer remains properly secured at all times</li>
            <li>All loads weighing more than 30,000 lbs must be scaled</li>
          </ul>
          <p style="font-size: 14px; color: #333; margin-bottom: 8px;">
            Failure to follow these procedures will result in a penalty, especially in cases where:
          </p>
          <ul style="font-size: 14px; color: #333; margin-bottom: 12px; padding-left: 20px;">
            <li>The driver did not verify the seal</li>
            <li>The seal was missing or tampered with and not properly checked</li>
          </ul>
          <p style="font-size: 14px; font-weight: bold; color: #cc0000;">No exceptions.</p>
          <p style="font-size: 14px; color: #333; margin-top: 12px;">
            Please remember: the load is the driver&rsquo;s responsibility from the moment the trailer doors are closed at the shipper until they are opened at the receiver.
          </p>
        </div>
        <br/>
        <p style="font-size: 14px; color: #666;">
          Best regards,<br/>
          Dispatch Team
        </p>
      </div>
    `;

    console.log("📧 ========================================");
    console.log("📧 EMAIL HTML CONSTRUCTED");
    console.log("📧 ========================================");
    console.log(`📧 HTML length: ${emailHtml.length} characters`);
    console.log("📧 ========================================");

    // Send email with attachment
    console.log("📧 ========================================");
    console.log("📧 SENDING EMAIL VIA RESEND");
    console.log("📧 ========================================");
    console.log(`📧 To: [${to}]`);
    console.log(`📧 From: ${from}`);
    console.log(`📧 CC: ${cc ? `[${cc}]` : "none"}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Attachment filename: ${attachmentFilename}`);
    console.log(`📧 Attachment content type: ${attachmentContentType}`);

    const toArray = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    const emailPayload: any = {
      from: from,
      to: toArray,
      subject: subject,
      html: emailHtml,
      attachments: [
        {
          filename: attachmentFilename,
          content: attachmentBase64,
          type: attachmentContentType,
        },
      ],
    };

    // Add CC if provided
    if (cc && cc.trim().length > 0) {
      emailPayload.cc = cc.includes(",") ? cc.split(",").map((email) => email.trim()) : [cc.trim()];
      console.log(`📧 CC field added to payload:`, emailPayload.cc);
    } else {
      console.log(`📧 No CC field provided or empty`);
    }

    console.log(
      "📧 Full email payload (without base64):",
      JSON.stringify(
        {
          ...emailPayload,
          attachments: emailPayload.attachments.map((a: any) => ({
            filename: a.filename,
            contentLength: a.content?.length || 0,
          })),
        },
        null,
        2,
      ),
    );

    const emailResponse = await resend.emails.send(emailPayload);

    console.log("✅ ========================================");
    console.log("✅ EMAIL SENT SUCCESSFULLY");
    console.log("✅ ========================================");
    console.log("✅ Resend Response:", JSON.stringify(emailResponse, null, 2));
    console.log("✅ ========================================");

    return new Response(
      JSON.stringify({
        success: true,
        data: emailResponse,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      },
    );
  } catch (error: any) {
    console.error("❌ ========================================");
    console.error("❌ ERROR SENDING EMAIL");
    console.error("❌ ========================================");
    console.error("❌ Error Type:", error.name);
    console.error("❌ Error Message:", error.message);
    console.error("❌ Error Stack:", error.stack);
    if (error.response) {
      console.error("❌ Resend API Response:", error.response);
    }
    console.error("❌ ========================================");

    return new Response(JSON.stringify({ error: error.message || "Unknown error occurred" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);

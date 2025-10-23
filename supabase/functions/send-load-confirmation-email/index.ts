import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  to: string;
  from: string;
  cc: string;
  subject: string;
  bodyText: string;
  attachmentBase64: string;
  attachmentFilename: string;
  attachmentContentType: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      to,
      from,
      cc,
      subject,
      bodyText,
      attachmentBase64,
      attachmentFilename,
      attachmentContentType
    }: EmailRequest = await req.json();

    console.log(`📧 Sending email to: ${to}`);
    console.log(`📧 From: ${from}, CC: ${cc}`);
    console.log(`📧 Subject: ${subject}`);

    // Convert base64 to buffer for attachment
    const attachmentBuffer = Uint8Array.from(atob(attachmentBase64), c => c.charCodeAt(0));

    const emailResponse = await resend.emails.send({
      from: from,
      to: [to],
      cc: [cc],
      subject: subject,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <p style="font-size: 16px; color: #333;">
            ${bodyText}
          </p>
          <br/>
          <p style="font-size: 14px; color: #666;">
            Best regards,<br/>
            Dispatch Team
          </p>
        </div>
      `,
      attachments: [
        {
          filename: attachmentFilename,
          content: attachmentBuffer,
          content_type: attachmentContentType
        }
      ]
    });

    console.log("✅ Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("❌ Error sending email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

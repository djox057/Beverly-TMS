import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.1";

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

    console.log('📧 ========================================');
    console.log('📧 EMAIL REQUEST RECEIVED');
    console.log('📧 ========================================');
    console.log(`📧 To: ${to}`);
    console.log(`📧 From: ${from}`);
    console.log(`📧 CC: ${cc}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Attachment: ${attachmentFilename}`);
    console.log(`📧 Attachment Type: ${attachmentContentType}`);
    console.log(`📧 Body: ${bodyText}`);
    console.log('📧 ========================================');

    // Validate required fields
    if (!to || !from || !subject) {
      throw new Error('Missing required fields: to, from, or subject');
    }

    // Prepare attachment - clean base64 and convert to buffer
    console.log('📧 Preparing attachment...');
    console.log(`📧 Original attachment size: ${attachmentBase64.length} characters`);
    
    // Remove data URI prefix if present (e.g., "data:application/pdf;base64,")
    let cleanBase64 = attachmentBase64;
    if (attachmentBase64.includes('base64,')) {
      cleanBase64 = attachmentBase64.split('base64,')[1];
      console.log('📧 Removed data URI prefix from base64');
    }
    console.log(`📧 Clean base64 size: ${cleanBase64.length} characters`);
    
    // Convert to Buffer for Resend
    const buffer = new Uint8Array(
      atob(cleanBase64)
        .split('')
        .map(char => char.charCodeAt(0))
    );
    console.log(`📧 Buffer size: ${buffer.length} bytes`);

    console.log('📧 Calling Resend API...');
    const emailResponse = await resend.emails.send({
      from: from,
      to: [to],
      cc: cc ? [cc] : undefined,
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
          content: buffer,
          contentType: attachmentContentType,
        }
      ]
    });

    console.log('✅ ========================================');
    console.log('✅ EMAIL SENT SUCCESSFULLY');
    console.log('✅ ========================================');
    console.log('✅ Resend Response:', JSON.stringify(emailResponse, null, 2));
    console.log('✅ ========================================');

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
    console.error('❌ ========================================');
    console.error('❌ ERROR SENDING EMAIL');
    console.error('❌ ========================================');
    console.error('❌ Error Type:', error.name);
    console.error('❌ Error Message:', error.message);
    console.error('❌ Error Stack:', error.stack);
    if (error.response) {
      console.error('❌ Resend API Response:', error.response);
    }
    console.error('❌ ========================================');
    
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error occurred' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

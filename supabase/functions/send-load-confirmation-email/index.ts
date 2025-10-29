import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Load test PDF for debugging
const testPdfPath = new URL('./test-attachment.pdf', import.meta.url).pathname;
let testPdfBuffer: Uint8Array | null = null;
try {
  testPdfBuffer = await Deno.readFile(testPdfPath);
  console.log('📎 Loaded test PDF buffer:', testPdfBuffer.length, 'bytes');
} catch (e: any) {
  console.log('⚠️ Could not load test PDF:', e?.message || String(e));
}

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

    // TEST MODE: Use hardcoded test PDF to isolate the issue
    console.log('📧 TEST MODE: Using hardcoded test PDF');
    
    // Also try to process the incoming attachment for comparison
    let incomingBuffer: Uint8Array | null = null;
    if (attachmentBase64) {
      try {
        let cleanBase64 = attachmentBase64;
        if (attachmentBase64.includes('base64,')) {
          cleanBase64 = attachmentBase64.split('base64,')[1];
          console.log('📧 Removed data URI prefix from incoming base64');
        }
        
        const binaryString = atob(cleanBase64);
        incomingBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          incomingBuffer[i] = binaryString.charCodeAt(i);
        }
        console.log(`📧 Incoming buffer size: ${incomingBuffer.length} bytes`);
      } catch (e: any) {
        console.error('❌ Error processing incoming attachment:', e?.message || String(e));
      }
    }

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
          <p style="font-size: 12px; color: #999; margin-top: 20px;">
            [TEST MODE - Using hardcoded PDF. Incoming buffer: ${incomingBuffer?.length || 0} bytes, Test buffer: ${testPdfBuffer?.length || 0} bytes]
          </p>
        </div>
      `,
      attachments: testPdfBuffer ? [
        {
          filename: 'test-load-confirmation.pdf',
          content: testPdfBuffer,
        }
      ] : []
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

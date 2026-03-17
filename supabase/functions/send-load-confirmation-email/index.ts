import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";

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

// Escape HTML special characters to prevent XSS
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

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
    console.log(`📧 Body Text length: ${bodyText?.length || 0}`);
    console.log(`📧 Base64 length: ${attachmentBase64?.length || 0}`);
    console.log('📧 ========================================');

    // Validate required fields
    if (!to || !from || !subject) {
      throw new Error('Missing required fields: to, from, or subject');
    }

    // Validate bodyText length to prevent abuse
    if (bodyText && bodyText.length > 5000) {
      throw new Error('Body text exceeds maximum length of 5000 characters');
    }

    // Build email HTML with escaped bodyText
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <p style="font-size: 16px; color: #333;">
          ${escapeHtml(bodyText)}
        </p>
        <br/>
        <div style="border-top: 2px solid #cc0000; margin-top: 20px; padding-top: 16px;">
          <p style="font-size: 15px; font-weight: bold; color: #cc0000; margin-bottom: 10px;">
            IMPORTANT – LOAD SECURITY REQUIREMENT
          </p>
          <p style="font-size: 14px; color: #333; margin-bottom: 8px;">
            If you are hauling any type of beverages or food products, the following is mandatory:
          </p>
          <ul style="font-size: 14px; color: #333; margin-bottom: 12px; padding-left: 20px;">
            <li>A padlock and seal must be applied immediately after leaving the shipper</li>
            <li>You must take a clear photo as proof after sealing the trailer</li>
            <li>You must also take a photo before arriving at the receiver to confirm the seal is intact</li>
          </ul>
          <p style="font-size: 14px; color: #333; margin-bottom: 8px;">Additionally:</p>
          <ul style="font-size: 14px; color: #333; margin-bottom: 12px; padding-left: 20px;">
            <li>The seal number must be verified and match documentation</li>
            <li>Drivers are responsible for ensuring the trailer remains properly secured at all times</li>
          </ul>
          <p style="font-size: 14px; color: #333; margin-bottom: 8px;">
            Failure to follow these procedures will result in a penalty, especially in cases where:
          </p>
          <ul style="font-size: 14px; color: #333; margin-bottom: 12px; padding-left: 20px;">
            <li>The driver did not verify the seal</li>
            <li>The seal was missing or tampered with and not properly checked</li>
          </ul>
          <p style="font-size: 14px; font-weight: bold; color: #cc0000;">No exceptions.</p>
        </div>
        <br/>
        <p style="font-size: 14px; color: #666;">
          Best regards,<br/>
          Dispatch Team
        </p>
      </div>
    `;

    console.log('📧 ========================================');
    console.log('📧 EMAIL HTML CONSTRUCTED');
    console.log('📧 ========================================');
    console.log(`📧 HTML length: ${emailHtml.length} characters`);
    console.log('📧 ========================================');

    // Send email with attachment
    console.log('📧 ========================================');
    console.log('📧 SENDING EMAIL VIA RESEND');
    console.log('📧 ========================================');
    console.log(`📧 To: [${to}]`);
    console.log(`📧 From: ${from}`);
    console.log(`📧 CC: ${cc ? `[${cc}]` : 'none'}`);
    console.log(`📧 Subject: ${subject}`);
    console.log(`📧 Attachment filename: ${attachmentFilename}`);
    console.log(`📧 Attachment content type: ${attachmentContentType}`);
    
    const emailPayload: any = {
      from: from,
      to: [to],
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
      emailPayload.cc = cc.includes(',') 
        ? cc.split(',').map(email => email.trim()) 
        : [cc.trim()];
      console.log(`📧 CC field added to payload:`, emailPayload.cc);
    } else {
      console.log(`📧 No CC field provided or empty`);
    }
    
    console.log('📧 Full email payload (without base64):', JSON.stringify({
      ...emailPayload,
      attachments: emailPayload.attachments.map((a: any) => ({
        filename: a.filename,
        contentLength: a.content?.length || 0
      }))
    }, null, 2));
    
    const emailResponse = await resend.emails.send(emailPayload);

    console.log('✅ ========================================');
    console.log('✅ EMAIL SENT SUCCESSFULLY');
    console.log('✅ ========================================');
    console.log('✅ Resend Response:', JSON.stringify(emailResponse, null, 2));
    console.log('✅ ========================================');

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: emailResponse
      }),
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

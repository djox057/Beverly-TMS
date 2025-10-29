import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";

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

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convert base64 to buffer
    console.log('📧 Converting base64 attachment to buffer...');
    const attachmentBuffer = Uint8Array.from(atob(attachmentBase64), c => c.charCodeAt(0));
    console.log(`📧 Attachment buffer size: ${attachmentBuffer.length} bytes`);

    // Upload file to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `temp/${timestamp}-${attachmentFilename}`;
    
    console.log('📧 Uploading file to Supabase Storage...');
    console.log(`📧 Storage path: ${storagePath}`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('email-attachments')
      .upload(storagePath, attachmentBuffer, {
        contentType: attachmentContentType,
        upsert: false
      });

    if (uploadError) {
      console.error('❌ Storage upload error:', uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    console.log('✅ File uploaded successfully:', uploadData);

    // Get public URL with 1 year expiry
    const expiresIn = 365 * 24 * 60 * 60; // 1 year in seconds
    const { data: signedUrlData } = await supabase.storage
      .from('email-attachments')
      .createSignedUrl(storagePath, expiresIn);

    if (!signedUrlData?.signedUrl) {
      throw new Error('Failed to generate signed URL');
    }

    console.log('✅ Signed URL generated:', signedUrlData.signedUrl);

    // Send email with download link instead of attachment
    console.log('📧 Sending email with download link...');
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
          <div style="margin: 20px 0;">
            <a href="${signedUrlData.signedUrl}" 
               style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Download ${attachmentFilename}
            </a>
          </div>
          <p style="font-size: 12px; color: #999;">
            This link will expire in 1 year.
          </p>
          <br/>
          <p style="font-size: 14px; color: #666;">
            Best regards,<br/>
            Dispatch Team
          </p>
        </div>
      `
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

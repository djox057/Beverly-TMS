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
    console.log(`📧 Base64 length: ${attachmentBase64?.length || 0}`);
    console.log('📧 ========================================');

    // Validate required fields
    if (!to || !from || !subject) {
      throw new Error('Missing required fields: to, from, or subject');
    }

    // Initialize Supabase client
    console.log('🔧 Initializing Supabase client...');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    console.log(`🔧 Supabase URL: ${supabaseUrl}`);
    console.log(`🔧 Service key exists: ${!!supabaseServiceKey}`);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('✅ Supabase client initialized');

    // Convert base64 to buffer
    console.log('📧 Converting base64 attachment to buffer...');
    const attachmentBuffer = Uint8Array.from(atob(attachmentBase64), c => c.charCodeAt(0));
    console.log(`📧 Attachment buffer size: ${attachmentBuffer.length} bytes`);

    // Upload file to Supabase Storage
    const timestamp = Date.now();
    const storagePath = `temp/${timestamp}-${attachmentFilename}`;
    
    console.log('📦 ========================================');
    console.log('📦 UPLOADING FILE TO SUPABASE STORAGE');
    console.log('📦 ========================================');
    console.log(`📦 Storage path: ${storagePath}`);
    console.log(`📦 Bucket: email-attachments`);
    console.log(`📦 Content type: ${attachmentContentType}`);
    console.log(`📦 File size: ${attachmentBuffer.length} bytes`);
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('email-attachments')
      .upload(storagePath, attachmentBuffer, {
        contentType: attachmentContentType,
        upsert: false
      });

    if (uploadError) {
      console.error('❌ ========================================');
      console.error('❌ STORAGE UPLOAD ERROR');
      console.error('❌ ========================================');
      console.error('❌ Error:', uploadError);
      console.error('❌ Error message:', uploadError.message);
      console.error('❌ Error details:', JSON.stringify(uploadError, null, 2));
      console.error('❌ ========================================');
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    console.log('✅ ========================================');
    console.log('✅ FILE UPLOADED SUCCESSFULLY');
    console.log('✅ ========================================');
    console.log('✅ Upload data:', JSON.stringify(uploadData, null, 2));
    console.log('✅ ========================================');

    // Get public URL (bucket is public)
    console.log('🔗 ========================================');
    console.log('🔗 GENERATING PUBLIC URL');
    console.log('🔗 ========================================');
    console.log(`🔗 Path: ${storagePath}`);
    
    const { data: publicUrlData } = supabase.storage
      .from('email-attachments')
      .getPublicUrl(storagePath);

    if (!publicUrlData?.publicUrl) {
      console.error('❌ ========================================');
      console.error('❌ NO PUBLIC URL IN RESPONSE');
      console.error('❌ ========================================');
      console.error('❌ publicUrlData:', JSON.stringify(publicUrlData, null, 2));
      console.error('❌ ========================================');
      throw new Error('Failed to generate public URL - no URL in response');
    }

    console.log('✅ ========================================');
    console.log('✅ PUBLIC URL GENERATED SUCCESSFULLY');
    console.log('✅ ========================================');
    console.log(`✅ Public URL: ${publicUrlData.publicUrl}`);
    console.log(`✅ URL length: ${publicUrlData.publicUrl.length}`);
    console.log('✅ ========================================');

    // Build email HTML with download link
    const downloadUrl = publicUrlData.publicUrl;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <p style="font-size: 16px; color: #333;">
          ${bodyText}
        </p>
        <br/>
        <div style="margin: 20px 0;">
          <a href="${downloadUrl}" 
             style="display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
            Download ${attachmentFilename}
          </a>
        </div>
        <p style="font-size: 12px; color: #999;">
          Click the button above to download your file.
        </p>
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
    console.log(`📧 Contains download link: ${emailHtml.includes(downloadUrl)}`);
    console.log('📧 Download URL in HTML:', downloadUrl);
    console.log('📧 Full HTML:');
    console.log(emailHtml);
    console.log('📧 ========================================');

    // Send email with download link
    console.log('📧 ========================================');
    console.log('📧 SENDING EMAIL VIA RESEND');
    console.log('📧 ========================================');
    console.log(`📧 To: [${to}]`);
    console.log(`📧 From: ${from}`);
    console.log(`📧 CC: ${cc ? `[${cc}]` : 'none'}`);
    console.log(`📧 Subject: ${subject}`);
    
    const emailPayload: any = {
      from: from,
      to: [to],
      subject: subject,
      html: emailHtml
    };
    
    if (cc && cc.trim()) {
      emailPayload.cc = [cc];
      console.log(`📧 CC field added to payload: [${cc}]`);
    }
    
    console.log('📧 Full email payload:', JSON.stringify(emailPayload, null, 2));
    
    const emailResponse = await resend.emails.send(emailPayload);

    console.log('✅ ========================================');
    console.log('✅ EMAIL SENT SUCCESSFULLY');
    console.log('✅ ========================================');
    console.log('✅ Resend Response:', JSON.stringify(emailResponse, null, 2));
    console.log('✅ ========================================');

    return new Response(
      JSON.stringify({ 
        success: true, 
        data: emailResponse,
        publicUrl: publicUrlData.publicUrl,
        storagePath: storagePath
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

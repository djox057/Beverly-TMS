import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.1";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
  storagePath: string;
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
      storagePath,
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
    console.log(`📧 Storage Path: ${storagePath}`);
    console.log(`📧 Attachment Filename: ${attachmentFilename}`);
    console.log(`📧 Attachment Type: ${attachmentContentType}`);
    console.log(`📧 Body: ${bodyText}`);
    console.log('📧 ========================================');

    // Validate required fields
    if (!to || !from || !subject) {
      throw new Error('Missing required fields: to, from, or subject');
    }

    if (!storagePath) {
      throw new Error('Missing storage path for attachment');
    }

    // Generate a signed URL for download (valid for 24 hours)
    console.log('🔗 Generating signed download URL...');
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('email-attachments')
      .createSignedUrl(storagePath, 86400); // 24 hours

    if (signedUrlError || !signedUrlData) {
      console.error('❌ Signed URL error:', signedUrlError);
      throw new Error(`Failed to create signed URL: ${signedUrlError?.message || 'No URL data'}`);
    }

    console.log(`✅ Signed URL created: ${signedUrlData.signedUrl}`);

    // Send email with plain text and download link
    console.log('📧 Sending email with download link...');
    
    const emailResponse = await resend.emails.send({
      from: from,
      to: [to],
      cc: cc ? [cc] : undefined,
      subject: subject,
      text: `${bodyText}\n\nDownload your load confirmation here:\n${signedUrlData.signedUrl}\n\nThis link is valid for 24 hours.\n\nBest regards,\nDispatch Team`,
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
      console.error('❌ Resend API Response:', JSON.stringify(error.response, null, 2));
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

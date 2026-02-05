import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PasswordResetRequest {
  email: string;
  redirectTo: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo }: PasswordResetRequest = await req.json();

    console.log('📧 Password reset requested for:', email);

    if (!email) {
      throw new Error('Email is required');
    }

    // Create Supabase admin client to generate password reset link
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Generate password reset link
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (linkError) {
      console.error('Error generating reset link:', linkError);
      throw new Error('Failed to generate password reset link');
    }

    const resetLink = data?.properties?.action_link;
    
    if (!resetLink) {
      throw new Error('Failed to generate password reset link');
    }

    console.log('📧 Reset link generated successfully');

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "BF Prime Dispatch <jon@bfprime.net>",
      to: [email],
      subject: "Reset Your Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333; margin-bottom: 20px;">Password Reset Request</h2>
          <p style="font-size: 16px; color: #555; line-height: 1.5;">
            We received a request to reset your password. Click the button below to create a new password:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-size: 16px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 14px; color: #777; line-height: 1.5;">
            If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
          <p style="font-size: 14px; color: #777; line-height: 1.5;">
            This link will expire in 24 hours.
          </p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 12px; color: #999;">
            BF Prime Dispatch Team
          </p>
        </div>
      `,
    });

    console.log('📧 Password reset email sent successfully:', emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: 'Password reset email sent' }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error('❌ Error sending password reset email:', error);
    
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to send password reset email' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

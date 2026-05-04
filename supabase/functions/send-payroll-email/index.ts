import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PayrollEmailRequest {
  recipientEmail: string;
  dispatcherName: string;
  payPeriod: string;
  pdfBytes: number[]; // Raw PDF bytes array
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication and restrict to accounting/manager/admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id);
    const allowedRoles = new Set(['admin', 'manager', 'accounting']);
    const hasAllowed = (roles ?? []).some((r: any) => allowedRoles.has(r.role));
    if (!hasAllowed) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { recipientEmail, dispatcherName, payPeriod, pdfBytes }: PayrollEmailRequest = await req.json();

    console.log(`Sending payroll email to ${recipientEmail} for ${dispatcherName}`);

    const actualRecipient = recipientEmail;

    // Convert bytes array to base64 for attachment
    const uint8Array = new Uint8Array(pdfBytes);
    const base64Content = btoa(String.fromCharCode.apply(null, [...uint8Array]));

    const filename = `${dispatcherName}.pdf`;

    const emailResponse = await resend.emails.send({
      from: "Beverly Freight Management <statements@beverlyfreight.net>",
      to: [actualRecipient],
      subject: `Payroll Statement - ${payPeriod}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Beverly Freight Management</h2>
          <p style="color: #FF0000; font-weight: bold; font-style: italic; text-decoration: underline;">
            ***Due to the company policy discussing your salary at work is prohibited. If there are any problems and concerns they need to be discussed with the managers directly***
          </p>
          <p>Dear ${dispatcherName},</p>
          <p>Please find attached your payroll statement for ${payPeriod}.</p>
          <br>
          <p>Best regards,<br>Beverly Freight Management</p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: base64Content,
          content_type: "application/pdf",
        } as any,
      ],
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending payroll email:", error);
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

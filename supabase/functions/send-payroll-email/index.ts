import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";

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
    const { recipientEmail, dispatcherName, payPeriod, pdfBytes }: PayrollEmailRequest = await req.json();

    console.log(`Sending payroll email to ${recipientEmail} for ${dispatcherName}`);

    const actualRecipient = recipientEmail;

    // Convert bytes array to base64 for attachment
    const uint8Array = new Uint8Array(pdfBytes);
    const base64Content = btoa(String.fromCharCode.apply(null, [...uint8Array]));

    const filename = `Payroll_${dispatcherName.replace(/\s+/g, "_")}_${payPeriod.replace(/,?\s+/g, "_")}.pdf`;

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

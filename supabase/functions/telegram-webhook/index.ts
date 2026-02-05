import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@4.0.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const update = await req.json();
    console.log('Received Telegram update:', JSON.stringify(update, null, 2));

    // Check if this is a message_reaction update
    if (!update.message_reaction) {
      console.log('Not a message_reaction update, ignoring');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { message_id, chat, new_reaction } = update.message_reaction;
    console.log(`Reaction received on message_id: ${message_id} in chat: ${chat.id}`);
    console.log('New reactions:', JSON.stringify(new_reaction));

    // Check if the reaction is a heart emoji (❤️) for completion or thumbs down (👎) for failure
    const hasHeartEmoji = new_reaction?.some((reaction: any) => 
      reaction.type === 'emoji' && reaction.emoji === '❤'
    );
    const hasThumbsDownEmoji = new_reaction?.some((reaction: any) => 
      reaction.type === 'emoji' && reaction.emoji === '👎'
    );

    if (!hasHeartEmoji && !hasThumbsDownEmoji) {
      console.log('Not a heart or thumbs down emoji reaction, ignoring');
      return new Response(JSON.stringify({ ok: true, message: 'Not a recognized emoji' }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const isFailure = hasThumbsDownEmoji;
    console.log(isFailure ? 'Thumbs down emoji detected, processing HOS failure' : 'Heart emoji detected, processing HOS completion');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Look up the HOS request by message_id
    const { data: hosRequest, error: fetchError } = await supabase
      .from('hos_requests')
      .select('*')
      .eq('telegram_message_id', message_id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !hosRequest) {
      console.log('No pending HOS request found for message_id:', message_id);
      return new Response(JSON.stringify({ ok: true, message: 'No pending request found' }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log('Found HOS request:', hosRequest);

    // Check if already notified
    if (hosRequest.notified_at) {
      console.log('Already notified for this request');
      return new Response(JSON.stringify({ ok: true, message: 'Already notified' }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Send email notification
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error('Missing RESEND_API_KEY');
      return new Response(
        JSON.stringify({ error: 'Email configuration missing' }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const resend = new Resend(resendApiKey);

    const statusText = isFailure ? 'Failed' : 'Completed';
    const statusColor = isFailure ? '#ef4444' : '#22c55e';
    const statusSymbol = isFailure ? '✗' : '✓';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${statusColor};">HOS Request ${statusText} ${statusSymbol}</h2>
        <p>Your HOS request has ${isFailure ? 'failed to be processed' : 'been processed'}.</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Driver:</strong> ${hosRequest.driver_name}</p>
          <p style="margin: 4px 0;"><strong>Vehicle:</strong> ${hosRequest.truck_number}</p>
          <p style="margin: 4px 0;"><strong>Company:</strong> ${hosRequest.company_name}</p>
          <p style="margin: 4px 0;"><strong>Request Type:</strong> ${hosRequest.request_type}</p>
          ${hosRequest.request_details ? `<p style="margin: 4px 0;"><strong>Details:</strong> ${hosRequest.request_details}</p>` : ''}
        </div>
        <p style="color: #6b7280; font-size: 14px;">This is an automated notification from the dispatch system.</p>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: 'HOS Notifications <bob.i@bfprime.net>',
      to: [hosRequest.requester_email],
      subject: `HOS ${statusText} - ${hosRequest.driver_name} (${hosRequest.truck_number})`,
      html: emailHtml,
    });

    console.log('Email sent:', emailResponse);

    // Update the request status
    const newStatus = isFailure ? 'failed' : 'completed';
    const { error: updateError } = await supabase
      .from('hos_requests')
      .update({
        status: newStatus,
        notified_at: new Date().toISOString(),
      })
      .eq('id', hosRequest.id);

    if (updateError) {
      console.error('Failed to update HOS request status:', updateError);
    } else {
      console.log(`HOS request marked as ${newStatus}`);
    }

    if (updateError) {
      console.error('Failed to update HOS request status:', updateError);
    } else {
      console.log('HOS request marked as completed');
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Notification sent' }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in telegram-webhook function:", error);
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

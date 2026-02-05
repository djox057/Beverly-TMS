import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface HosRequestPayload {
  driverName: string;
  truckNumber: string;
  companyName: string;
  requestType: 'full_shift' | 'full_cycle' | 'custom';
  customHours?: {
    driveHours: number;
    driveMinutes: number;
    shiftHours: number;
    shiftMinutes: number;
    cycleHours: number;
    cycleMinutes: number;
  };
  violationFix: boolean;
  requesterEmail?: string;
}

const formatDuration = (hours: number, minutes: number): string => {
  const parts: string[] = [];
  
  if (hours > 0) {
    parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  }
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  }
  
  if (parts.length === 0) {
    return '0 minutes';
  }
  
  return parts.join(' and ');
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload: HosRequestPayload = await req.json();
    console.log('Received HOS request payload:', JSON.stringify(payload, null, 2));

    const { driverName, truckNumber, companyName, requestType, customHours, violationFix, requesterEmail } = payload;

    // Build request type text
    let requestTypeText = '';
    if (requestType === 'full_shift') {
      requestTypeText = 'Full Shift';
    } else if (requestType === 'full_cycle') {
      requestTypeText = 'Full Cycle';
    } else if (requestType === 'custom' && customHours) {
      const parts: string[] = [];
      const driveTotal = customHours.driveHours + customHours.driveMinutes;
      const shiftTotal = customHours.shiftHours + customHours.shiftMinutes;
      const cycleTotal = customHours.cycleHours + customHours.cycleMinutes;
      
      if (driveTotal > 0) {
        parts.push(`${formatDuration(customHours.driveHours, customHours.driveMinutes)} in Drive`);
      }
      if (shiftTotal > 0) {
        parts.push(`${formatDuration(customHours.shiftHours, customHours.shiftMinutes)} in Shift`);
      }
      if (cycleTotal > 0) {
        parts.push(`${formatDuration(customHours.cycleHours, customHours.cycleMinutes)} in Cycle`);
      }
      requestTypeText = parts.join('\n');
    }

    // Add violation fix suffix if checked
    const violationText = violationFix ? ' + Violation Fix' : '';

    // Build the message
    const message = `Driver: ${driverName}
Vehicle: ${truckNumber}
Company: ${companyName}
${requestTypeText}${violationText}`;

    console.log('Sending message to Telegram:', message);

    const telegramBotToken = (Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "").trim();
    const telegramChatId = (Deno.env.get("TELEGRAM_CHAT_ID") ?? "").trim();

    console.log(
      `Telegram config loaded: token_len=${telegramBotToken.length}, token_last4=${telegramBotToken.slice(-4)}, chat_id_len=${telegramChatId.length}`
    );

    if (!telegramBotToken || !telegramChatId) {
      console.error('Missing Telegram configuration');
      return new Response(
        JSON.stringify({ error: 'Telegram configuration missing' }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Send message to Telegram
    const telegramUrl = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;
    const telegramResponse = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    const telegramResult = await telegramResponse.json();
    console.log('Telegram API response:', JSON.stringify(telegramResult, null, 2));

    if (!telegramResult.ok) {
      console.error('Telegram API error:', telegramResult);
      return new Response(
        JSON.stringify({ error: 'Failed to send Telegram message', details: telegramResult }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Store the request in the database if we have requester email
    if (requesterEmail && telegramResult.result?.message_id) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      
      if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        const requestDetails = requestType === 'custom' && customHours
          ? `${requestTypeText}${violationText}`
          : `${requestTypeText}${violationText}`;
        
        const { error: dbError } = await supabase.from('hos_requests').insert({
          telegram_message_id: telegramResult.result.message_id,
          telegram_chat_id: telegramChatId,
          requester_email: requesterEmail,
          driver_name: driverName,
          truck_number: truckNumber,
          company_name: companyName,
          request_type: requestType,
          request_details: requestDetails,
          status: 'pending'
        });
        
        if (dbError) {
          console.error('Failed to store HOS request in database:', dbError);
          // Don't fail the request if DB insert fails
        } else {
          console.log('HOS request stored in database with message_id:', telegramResult.result.message_id);
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'HOS request sent successfully' }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-hos-request function:", error);
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

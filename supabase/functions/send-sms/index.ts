import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SMSRequest {
  message: string;
  phoneNumbers?: string[];
  phoneNumber?: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const { message, phoneNumbers, phoneNumber }: SMSRequest = await req.json();

    // Get credentials from environment
    const CLIENT_ID = Deno.env.get('RINGCENTRAL_CLIENT_ID');
    const CLIENT_SECRET = Deno.env.get('RINGCENTRAL_CLIENT_SECRET');
    const JWT_TOKEN = Deno.env.get('RINGCENTRAL_JWT_TOKEN');
    const SERVER_URL = Deno.env.get('RINGCENTRAL_SERVER_URL') || 'https://platform.ringcentral.com';
    const FROM_NUMBER = Deno.env.get('RINGCENTRAL_PHONE_NUMBER');

    if (!CLIENT_ID || !CLIENT_SECRET || !JWT_TOKEN || !FROM_NUMBER) {
      throw new Error('Missing RingCentral credentials');
    }

    // Determine recipients - support both single phoneNumber and array of phoneNumbers
    const recipients = phoneNumbers || (phoneNumber ? [phoneNumber] : []);
    
    if (recipients.length === 0) {
      throw new Error('No phone numbers provided');
    }

    if (!message) {
      throw new Error('No message provided');
    }

    console.log(`Authenticating with RingCentral...`);

    // Step 1: Authenticate with RingCentral using JWT
    const authResponse = await fetch(`${SERVER_URL}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${JWT_TOKEN}`
    });

    if (!authResponse.ok) {
      const authError = await authResponse.text();
      console.error('Auth failed:', authError);
      throw new Error(`RingCentral authentication failed: ${authError}`);
    }

    const { access_token } = await authResponse.json();
    console.log('Successfully authenticated with RingCentral');

    // Step 2: Send SMS to each recipient
    const results = [];
    
    for (const recipient of recipients) {
      console.log(`Sending SMS to ${recipient}...`);
      
      const smsResponse = await fetch(`${SERVER_URL}/restapi/v1.0/account/~/extension/~/sms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: { phoneNumber: FROM_NUMBER },
          to: [{ phoneNumber: recipient }],
          text: message
        })
      });

      if (!smsResponse.ok) {
        const smsError = await smsResponse.text();
        console.error(`SMS to ${recipient} failed:`, smsError);
        results.push({ phoneNumber: recipient, success: false, error: smsError });
      } else {
        const smsData = await smsResponse.json();
        console.log(`SMS sent successfully to ${recipient}, messageId: ${smsData.id}`);
        results.push({ phoneNumber: recipient, success: true, messageId: smsData.id });
      }
    }

    const allSucceeded = results.every(r => r.success);
    
    return new Response(
      JSON.stringify({ 
        success: allSucceeded, 
        results,
        message: allSucceeded ? 'All SMS sent successfully' : 'Some SMS failed to send'
      }), 
      {
        status: allSucceeded ? 200 : 207, // 207 Multi-Status for partial success
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );

  } catch (error: any) {
    console.error('Error in send-sms function:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }), 
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      }
    );
  }
});

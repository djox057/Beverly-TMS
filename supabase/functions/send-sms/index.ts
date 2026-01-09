import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SmsRequest {
  message: string;
  phoneNumber?: string;
  phoneNumbers?: string[];
}

const env = (key: string) => {
  const v = Deno.env.get(key);
  return typeof v === "string" ? v.trim() : undefined;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: SmsRequest = await req.json();
    
    // Get credentials from environment (trim to avoid hidden whitespace/newlines)
    const CLIENT_ID = env("RINGCENTRAL_CLIENT_ID");
    const CLIENT_SECRET = env("RINGCENTRAL_CLIENT_SECRET");
    const REFRESH_TOKEN = env("RINGCENTRAL_REFRESH_TOKEN");
    const JWT_TOKEN = env("RINGCENTRAL_JWT_TOKEN");
    const SERVER_URL = env("RINGCENTRAL_SERVER_URL") || "https://platform.ringcentral.com";
    const FROM_NUMBER = env("RINGCENTRAL_PHONE_NUMBER");

    if (!CLIENT_ID || !CLIENT_SECRET || !FROM_NUMBER || (!REFRESH_TOKEN && !JWT_TOKEN)) {
      console.error("Missing RingCentral configuration", {
        hasClientId: !!CLIENT_ID,
        hasClientSecret: !!CLIENT_SECRET,
        hasRefreshToken: !!REFRESH_TOKEN,
        hasJwtToken: !!JWT_TOKEN,
        hasFromNumber: !!FROM_NUMBER,
        serverUrl: SERVER_URL,
      });
      throw new Error(
        "Missing RingCentral configuration - need RINGCENTRAL_JWT_TOKEN or RINGCENTRAL_REFRESH_TOKEN",
      );
    }

    // Prepare recipients
    const recipients =
      requestData.phoneNumbers ||
      (requestData.phoneNumber ? [requestData.phoneNumber] : []);

    if (recipients.length === 0) {
      throw new Error("No phone numbers provided");
    }

    if (!requestData.message?.trim()) {
      throw new Error("Message is required");
    }

    const tokenUrl = `${SERVER_URL}/restapi/oauth/token`;
    const authHeader = `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`;

    const requestAccessToken = async (authBody: URLSearchParams) => {
      const authResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": authHeader,
        },
        body: authBody.toString(),
      });

      const raw = await authResponse.text();
      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = { raw };
      }

      if (!authResponse.ok) {
        console.error("RingCentral auth failed:", parsed);
        throw new Error(`RingCentral auth failed: ${JSON.stringify(parsed)}`);
      }

      return parsed as { access_token: string; refresh_token?: string };
    };

    let access_token: string;

    // Prefer JWT auth (doesn't require storing/rotating refresh tokens)
    if (JWT_TOKEN) {
      console.log(`Authenticating with RingCentral at ${SERVER_URL} using JWT grant...`);

      const authBody = new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: JWT_TOKEN,
      });

      const authData = await requestAccessToken(authBody);
      access_token = authData.access_token;
    } else {
      // Fallback to refresh_token grant
      if (!REFRESH_TOKEN) {
        throw new Error("Missing RingCentral configuration - need RINGCENTRAL_REFRESH_TOKEN");
      }

      console.log(`Authenticating with RingCentral at ${SERVER_URL} using refresh_token...`);
      console.log("RingCentral token debug:", { refreshTokenLength: REFRESH_TOKEN.length });

      const authBody = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: REFRESH_TOKEN,
      });

      const authData = await requestAccessToken(authBody);
      access_token = authData.access_token;

      // Log if we got a new refresh token (should update secret if different)
      if (authData.refresh_token && authData.refresh_token !== REFRESH_TOKEN) {
        console.log(
          "New refresh token received - consider updating RINGCENTRAL_REFRESH_TOKEN secret",
        );
      }
    }

    console.log("Successfully authenticated with RingCentral");

    // Step 2: Send SMS to each recipient
    const toArray = recipients.map((num: string) => ({ phoneNumber: num }));

    console.log(`Sending SMS to ${recipients.length} recipient(s):`, recipients);

    const smsResponse = await fetch(`${SERVER_URL}/restapi/v1.0/account/~/extension/~/sms`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: { phoneNumber: FROM_NUMBER },
        to: toArray,
        text: requestData.message
      })
    });

    const smsData = await smsResponse.json();

    if (!smsResponse.ok) {
      console.error("SMS send failed:", smsData);
      throw new Error(`SMS send failed: ${JSON.stringify(smsData)}`);
    }

    console.log("SMS sent successfully, message ID:", smsData.id);

    return new Response(
      JSON.stringify({ success: true, messageId: smsData.id }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("SMS error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

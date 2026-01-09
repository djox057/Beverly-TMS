import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * One-time helper to exchange an authorization code for refresh token.
 * 
 * Steps to get the code:
 * 1. Visit: https://platform.ringcentral.com/restapi/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https://fleetcarrier.us/
 * 2. Log in and authorize
 * 3. Copy the "code" parameter from the redirect URL
 * 4. Call this function with { "code": "YOUR_CODE" }
 * 5. Save the returned refresh_token as RINGCENTRAL_REFRESH_TOKEN secret
 */
serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();
    
    if (!code) {
      return new Response(
        JSON.stringify({ 
          error: "Missing code parameter",
          instructions: [
            "1. Visit the authorization URL in your browser:",
            "   https://platform.ringcentral.com/restapi/oauth/authorize?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=https://fleetcarrier.us/",
            "2. Log in with your RingCentral credentials",
            "3. After redirect, copy the 'code' parameter from the URL",
            "4. Call this endpoint with: { \"code\": \"YOUR_CODE\" }",
          ]
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const CLIENT_ID = Deno.env.get("RINGCENTRAL_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("RINGCENTRAL_CLIENT_SECRET");
    const SERVER_URL = Deno.env.get("RINGCENTRAL_SERVER_URL") || "https://platform.ringcentral.com";
    const REDIRECT_URI = "https://fleetcarrier.us/";

    if (!CLIENT_ID || !CLIENT_SECRET) {
      throw new Error("Missing RINGCENTRAL_CLIENT_ID or RINGCENTRAL_CLIENT_SECRET");
    }

    console.log("Exchanging authorization code for tokens...");

    const tokenResponse = await fetch(`${SERVER_URL}/restapi/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`
      },
      body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenData);
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
    }

    console.log("Token exchange successful!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Save this refresh_token as RINGCENTRAL_REFRESH_TOKEN secret in Supabase",
        refresh_token: tokenData.refresh_token,
        access_token: tokenData.access_token,
        expires_in: tokenData.expires_in,
        refresh_token_expires_in: tokenData.refresh_token_expires_in,
      }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Auth error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

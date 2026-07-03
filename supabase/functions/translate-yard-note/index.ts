import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("Gemini API key not configured");
    }

    const { text, id } = await req.json();
    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are translating Serbian text from a trucking/dispatch operations context (US truckload freight). Translate to English using industry-standard American trucking terminology. Return ONLY the translated English text — no quotes, no explanations, no prefixes. If the text is already in English, return it unchanged.

Domain glossary (Serbian -> English), apply consistently:
- tura / ture -> load / loads
- utovar -> pickup (loading)
- istovar -> delivery (unloading)
- kamion -> truck
- prikolica / trejler -> trailer
- vozac / vozač -> driver
- dispecer / dispečer -> dispatcher
- ruta -> route
- gorivo -> fuel
- servis / popravka -> repair / service
- kvar -> breakdown
- guma / gume -> tire / tires
- prazan -> empty (deadhead)
- pun / natovaren -> loaded
- kasni / kasnjenje / kašnjenje -> late / delay
- brokera / broker -> broker
- rate / cena -> rate
- milja / milje -> mile / miles
- odmor -> rest / home time
- termin / apointment -> appointment
- skladiste / skladište -> warehouse
- prevoz -> transport / haul
- recovery / recoveri -> recovery load
- oil change / promena ulja -> oil change

Keep truck numbers, load numbers, city/state codes, times, and proper names unchanged.

Text:
${text}`;

    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Gemini error:", aiResponse.status, errText);
      throw new Error(`Gemini failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const translation: string =
      aiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    if (!translation) {
      throw new Error("Empty translation");
    }

    // If id provided, persist to DB using service role
    if (id) {
      const serviceClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await serviceClient
        .from("driver_yard_actions")
        .update({ comment_eng: translation })
        .eq("id", id);
    }

    return new Response(
      JSON.stringify({ success: true, translation }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("translate-yard-note error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
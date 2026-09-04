import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunkSize)));
  }
  return btoa(binary);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    if (!geminiApiKey) throw new Error("Gemini API key not configured");

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const typesRaw = (formData.get("types") as string) || "[]";
    if (!file) throw new Error("No file provided");

    let docTypes: { id: string; label: string }[] = [];
    try {
      docTypes = JSON.parse(typesRaw);
    } catch {
      docTypes = [];
    }

    const mime = file.type || "application/octet-stream";
    const supported =
      mime === "application/pdf" || mime.startsWith("image/") || mime === "text/plain";
    if (!supported) {
      return new Response(
        JSON.stringify({ success: true, data: { docId: null, unsupported: true } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = toBase64(bytes);

    const typeList = docTypes.map((t) => `- ${t.id}: ${t.label}`).join("\n");

    const prompt = `You classify US trucking driver-qualification-file documents. Use OCR if needed.

Document file name: "${file.name}"

Choose the single best matching document type id from this list, or "other" if none fits:
${typeList}
- other: none of the above

If (and only if) the document is a commercial driver license (CDL), also extract:
- cdl_number: the license/CDL number exactly as printed
- cdl_expiration_date: expiration date in YYYY-MM-DD format
- home_address: street address line only (no city/state/zip)
- home_city: city name
- home_state: 2-letter US state code

Return ONLY minified JSON, no markdown fences:
{"docId":"<id or other>","confidence":<0-1>,"cdl_number":null,"cdl_expiration_date":null,"home_address":null,"home_city":null,"home_state":null}
Use null for any value you cannot read. Never guess.`;

    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": geminiApiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inlineData: { mimeType: mime, data: base64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 1024, responseMimeType: "application/json" },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Gemini error:", aiResponse.status, errText);
      throw new Error(`Gemini failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const raw: string = aiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const cleaned = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      console.error("Failed to parse AI JSON:", cleaned);
      throw new Error("Could not read AI response");
    }

    const validIds = new Set(docTypes.map((t) => t.id));
    const docId = parsed.docId && validIds.has(parsed.docId) ? parsed.docId : null;

    const isCdl = docId === "cdl" || docId === "cdl_front" || docId === "cdl_back";
    const clean = (v: unknown) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s && s.toLowerCase() !== "null" ? s : null;
    };

    const data = {
      docId,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
      cdl_number: isCdl ? clean(parsed.cdl_number) : null,
      cdl_expiration_date: isCdl && /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.cdl_expiration_date ?? ""))
        ? parsed.cdl_expiration_date
        : null,
      home_address: isCdl ? clean(parsed.home_address) : null,
      home_city: isCdl ? clean(parsed.home_city) : null,
      home_state: isCdl ? (clean(parsed.home_state)?.toUpperCase().slice(0, 2) ?? null) : null,
    };

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("classify-driver-document error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message || "Failed to classify document" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const VIN_REGEX = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunk)));
  }
  return btoa(binary);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const isAdmin = (roleRows || []).some((r: any) => r.role === "admin");
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const { coi_file_id } = await req.json();
    if (!coi_file_id) return json({ error: "coi_file_id is required" }, 400);

    const { data: fileRow, error: fileErr } = await admin
      .from("company_coi_files")
      .select("id, company_name, file_path, content_type, file_name")
      .eq("id", coi_file_id)
      .maybeSingle();
    if (fileErr || !fileRow) return json({ error: "COI file not found" }, 404);

    const { data: blob, error: dlErr } = await admin.storage
      .from("company-coi")
      .download(fileRow.file_path);
    if (dlErr || !blob) return json({ error: `Download failed: ${dlErr?.message}` }, 500);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const mimeType =
      fileRow.content_type ||
      (fileRow.file_name?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) return json({ error: "Gemini API key not configured" }, 500);

    const prompt = `You are reading a Certificate of Insurance (COI) / schedule of vehicles document.
Extract EVERY vehicle VIN number listed on the document (17 characters, letters and digits, never contains I, O or Q).
Use OCR if the document is scanned.
Return ONLY valid JSON in this exact shape, with no markdown and no explanation:
{"vins": ["1FUJGLDR9CSBK1234", "..."]}
If no VINs are present return {"vins": []}.`;

    const aiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": geminiApiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: toBase64(bytes) } },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 8192 },
        }),
      },
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Gemini error:", aiRes.status, errText);
      return json({ error: `AI extraction failed (${aiRes.status})` }, 500);
    }

    const aiData = await aiRes.json();
    const text: string = aiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    let vins: string[] = [];
    try {
      const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      vins = Array.isArray(parsed?.vins) ? parsed.vins : [];
    } catch {
      vins = text.match(VIN_REGEX) || [];
    }

    const normalized = Array.from(
      new Set(
        vins
          .map((v) => String(v).toUpperCase().replace(/[^A-Z0-9]/g, ""))
          .filter((v) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v)),
      ),
    );

    if (normalized.length > 0) {
      const { error: insErr } = await admin.from("company_coi_vins").upsert(
        normalized.map((vin) => ({
          company_name: fileRow.company_name,
          vin,
          coi_file_id: fileRow.id,
        })),
        { onConflict: "company_name,vin" },
      );
      if (insErr) return json({ error: `Saving VINs failed: ${insErr.message}` }, 500);
    }

    return json({ success: true, count: normalized.length, vins: normalized });
  } catch (err: any) {
    console.error("extract-coi-vins error:", err?.message ?? err);
    return json({ error: err?.message ?? "Unexpected error" }, 500);
  }
});

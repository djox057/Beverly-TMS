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

const ALLOWED_ROLES = ["admin", "manager", "chicago_management"];

async function embed(text: string): Promise<number[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-embedding-2",
      input: text.slice(0, 20000),
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Embedding failed (${res.status}): ${detail}`);
  }
  const data = await res.json();
  const vector = data?.data?.[0]?.embedding;
  if (!Array.isArray(vector)) throw new Error("Embedding response had no vector");
  return vector;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
    const roles = (roleRows || []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => ALLOWED_ROLES.includes(r))) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "index") {
      const id = body?.id;
      const text = String(body?.text ?? "").trim();
      if (!id) return json({ error: "Missing id" }, 400);
      if (!text) {
        await admin.from("hr_reports").update({ embedding: null }).eq("id", id);
        return json({ ok: true, indexed: false });
      }
      const vector = await embed(text);
      const { error } = await admin
        .from("hr_reports")
        .update({ embedding: vector as unknown as string })
        .eq("id", id);
      if (error) throw error;
      return json({ ok: true, indexed: true });
    }

    if (action === "search") {
      const query = String(body?.query ?? "").trim();
      const threshold = Number(body?.threshold ?? 0.3);
      if (!query) return json({ matches: [] });
      const vector = await embed(query);
      const { data, error } = await admin.rpc("search_hr_reports", {
        query_embedding: vector as unknown as string,
        match_threshold: Number.isFinite(threshold) ? threshold : 0.3,
        match_count: 100,
      });
      if (error) throw error;
      return json({ matches: data || [] });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("hr-report-search error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});

// LoadMatch proxy — server-side fetches http://128.140.115.63:8080/api/matched-orders
// so the HTTPS browser origin can reach the plain-HTTP VPS without mixed-content blocking.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const UPSTREAM_BASE = "http://128.140.115.63:8080";
const UPSTREAM_TIMEOUT_MS = 15_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Auth: require a valid JWT.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Accept truck_id from query string or JSON body (supabase.functions.invoke uses POST body).
  let truckId: string | undefined;
  const urlObj = new URL(req.url);
  const qsTruck = urlObj.searchParams.get("truck_id");
  if (qsTruck) truckId = qsTruck;
  if (!truckId && (req.method === "POST" || req.method === "PUT")) {
    try {
      const body = await req.json();
      if (body && typeof body.truck_id === "string") truckId = body.truck_id;
    } catch {
      /* empty body is fine */
    }
  }
  if (truckId && !UUID_RE.test(truckId)) {
    return new Response(JSON.stringify({ error: "Invalid truck_id" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const upstream = new URL("/api/matched-orders", UPSTREAM_BASE);
  if (truckId) upstream.searchParams.set("truck_id", truckId);

  const sharedSecret = Deno.env.get("LOADMATCH_SHARED_SECRET");
  const upstreamHeaders: Record<string, string> = { Accept: "application/json" };
  if (sharedSecret) upstreamHeaders.Authorization = `Bearer ${sharedSecret}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const res = await fetch(upstream.toString(), {
      method: "GET",
      headers: upstreamHeaders,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return new Response(
        JSON.stringify({
          error: "Upstream error",
          status: res.status,
          body: text.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    // Pass upstream JSON straight through.
    return new Response(text, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const isAbort = (err as any)?.name === "AbortError";
    return new Response(
      JSON.stringify({
        error: isAbort
          ? `Upstream timed out after ${UPSTREAM_TIMEOUT_MS}ms`
          : `Upstream fetch failed: ${(err as Error)?.message ?? String(err)}`,
      }),
      {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } finally {
    clearTimeout(timeoutId);
  }
});
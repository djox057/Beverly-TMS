// One-time importer for the historical recruiting driver expense sheet.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-import-key",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const key = "tmp-import-9f3a71c4d85e4b2f";
  if (!key || req.headers.get("x-import-key") !== key) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const rows = await req.json();
  if (!Array.isArray(rows)) {
    return new Response(JSON.stringify({ error: "expected an array of rows" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error } = await admin.from("recruiting_driver_expenses").insert(chunk);
    if (error) return new Response(JSON.stringify({ inserted, error: error.message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    inserted += chunk.length;
  }
  return new Response(JSON.stringify({ inserted }), { headers: { ...cors, "Content-Type": "application/json" } });
});

import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * restore-dispatchers-on-duty
 *
 * Scheduled to run every Friday at 23:59 Chicago time (via two pg_cron entries
 * for CDT and CST). The function self-checks the actual Chicago weekday/hour
 * before doing work so a DST mismatch is a no-op.
 *
 * Behavior — mirrors `setDispatcherActive` in src/hooks/useFleetManagement.ts:
 *   1. Find every dispatcher_status row where is_active = false.
 *   2. For each one, read the stored `inactive_trucks` jsonb (which actually
 *      stores the original drivers' data) and reassign each still-active
 *      driver back to that dispatcher.
 *   3. Mark dispatcher_status.is_active = true and clear inactive_trucks.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const invocationId = crypto.randomUUID();

  // Auth: cron-secret header, cron-secret bearer, or service role bearer
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const cronSecretEnv = Deno.env.get("CRON_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let authMethod: string | null = null;
  if (cronSecretEnv && cronSecret === cronSecretEnv) {
    authMethod = "cron-secret";
  } else if (cronSecretEnv && authHeader === `Bearer ${cronSecretEnv}`) {
    authMethod = "cron-secret-bearer";
  } else if (anonKey && authHeader === `Bearer ${anonKey}`) {
    authMethod = "anon-bearer";
  } else if (serviceRoleKey && authHeader?.includes(serviceRoleKey)) {
    authMethod = "service-role";
  }

  if (!authMethod) {
    console.error(`[${invocationId}] Unauthorized`);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Allow callers to bypass the self-check (admin manual run / testing)
  const url = new URL(req.url);
  let force = url.searchParams.get("force") === "1";
  try {
    const body = await req.json();
    if (body?.force === true) force = true;
  } catch { /* no body */ }

  // Chicago time self-check: only run on Friday at 23:59
  const chicagoFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = chicagoFmt.formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value; // Fri
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);

  console.log(
    `[${invocationId}] Chicago=${weekday} ${hour}:${minute} auth=${authMethod} force=${force}`,
  );

  if (!force && weekday !== "Fri") {
    return new Response(
      JSON.stringify({ skipped: true, reason: "not-friday", weekday, hour, minute }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!force && hour !== 23) {
    return new Response(
      JSON.stringify({ skipped: true, reason: "wrong-hour", weekday, hour, minute }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Pull every off-duty dispatcher and the stored drivers payload
    const { data: offDuty, error: fetchErr } = await supabase
      .from("dispatcher_status")
      .select("dispatcher_id, inactive_trucks")
      .eq("is_active", false);

    if (fetchErr) throw fetchErr;

    let dispatchersRestored = 0;
    let driversReassigned = 0;
    const details: Array<{ dispatcher_id: string; reassigned: number; skipped: number }> = [];

    for (const row of offDuty ?? []) {
      const dispatcherId = row.dispatcher_id as string;
      const stored = (row.inactive_trucks as Array<{ id: string }> | null) ?? [];
      const storedIds = stored.map((d) => d?.id).filter((x): x is string => !!x);

      let reassigned = 0;
      let skipped = 0;

      if (storedIds.length > 0) {
        // Only reassign drivers that still exist and are active
        const { data: stillValid, error: checkErr } = await supabase
          .from("drivers")
          .select("id")
          .in("id", storedIds)
          .eq("is_active", true);

        if (checkErr) {
          console.error(`[${invocationId}] dispatcher=${dispatcherId} check failed:`, checkErr);
          continue;
        }

        const validIds = (stillValid ?? []).map((d) => d.id);
        skipped = storedIds.length - validIds.length;

        if (validIds.length > 0) {
          const { error: reassignErr } = await supabase
            .from("drivers")
            .update({ dispatcher_id: dispatcherId })
            .in("id", validIds);

          if (reassignErr) {
            console.error(`[${invocationId}] dispatcher=${dispatcherId} reassign failed:`, reassignErr);
            continue;
          }
          reassigned = validIds.length;
        }
      }

      // Flip status to active and clear stored drivers
      const now = new Date();
      const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;

      const { error: statusErr } = await supabase
        .from("dispatcher_status")
        .upsert(
          {
            dispatcher_id: dispatcherId,
            is_active: true,
            inactive_trucks: [],
            updated_at: ts,
          },
          { onConflict: "dispatcher_id" },
        );

      if (statusErr) {
        console.error(`[${invocationId}] dispatcher=${dispatcherId} status update failed:`, statusErr);
        continue;
      }

      dispatchersRestored++;
      driversReassigned += reassigned;
      details.push({ dispatcher_id: dispatcherId, reassigned, skipped });
      console.log(
        `[${invocationId}] dispatcher=${dispatcherId} reassigned=${reassigned} skipped=${skipped}`,
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        invocationId,
        dispatchersRestored,
        driversReassigned,
        details,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${invocationId}] failed:`, message);
    return new Response(JSON.stringify({ error: message, invocationId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

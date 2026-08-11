// Read-only RingCentral activity sync: account call log + per-extension message
// store -> deduped records + daily aggregates in Supabase.
//
// POST body:
//   { dateFrom?: "YYYY-MM-DD", dateTo?: "YYYY-MM-DD", extensionIds?: string[],
//     days?: number, scope?: string }
//
// Never sends, deletes or modifies anything in RingCentral.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  getAccessToken,
  missingScopes,
  readConfig,
  RingCentralAuthError,
  RingCentralConfigError,
} from "../_shared/ringcentral/auth.ts";
import { MAX_PAGES, RingCentralApiError, RingCentralClient } from "../_shared/ringcentral/client.ts";
import { dedupeCalls, type RawCallRecord } from "../_shared/ringcentral/dedupe.ts";
import {
  buildDailyMetrics,
  dedupeMessages,
  normalizeMessage,
  type NormalizedMessage,
  type RawMessageRecord,
} from "../_shared/ringcentral/metrics.ts";
import { localDate, localDayRangeToUtc } from "../_shared/ringcentral/normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const DEFAULT_TZ = "America/Chicago";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let scope = "incremental";

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    scope = typeof body.scope === "string" ? body.scope : "incremental";
    const timezone = typeof body.timezone === "string" ? body.timezone : DEFAULT_TZ;

    const today = localDate(new Date().toISOString(), timezone)!;
    const days = Math.min(Math.max(Number(body.days) || 0, 0), 31);
    const dateTo: string = typeof body.dateTo === "string" ? body.dateTo : today;
    const dateFrom: string = typeof body.dateFrom === "string"
      ? body.dateFrom
      : days > 0
      ? shiftDate(dateTo, -(days - 1))
      : dateTo;

    await admin.from("ringcentral_sync_state").upsert({
      scope,
      status: "running",
      last_attempted_sync_at: new Date().toISOString(),
      cursor_date: dateFrom,
    }, { onConflict: "scope" });

    const config = readConfig();
    const token = await getAccessToken(config);
    const missing = missingScopes(token);
    if (missing.length) {
      await recordFailure(admin, scope, "permission", `Missing RingCentral permissions: ${missing.join(", ")}`);
      return json({
        error: "missing_permission",
        missingPermissions: missing,
        action: "Enable these Application Permissions in the RingCentral Developer Console, then re-authorize the JWT credential.",
      }, 424);
    }

    const client = new RingCentralClient(config);

    // Extension roster (must be synced first).
    const { data: roster, error: rosterError } = await admin
      .from("ringcentral_extensions")
      .select("rc_extension_id, extension_number, primary_phone_number, is_active, user_id");
    if (rosterError) throw rosterError;
    if (!roster?.length) {
      await recordFailure(admin, scope, "unknown", "Extension roster is empty; run ringcentral-extensions-sync first");
      return json({ error: "no_extensions", detail: "Run ringcentral-extensions-sync first." }, 409);
    }

    const requestedIds: string[] | null = Array.isArray(body.extensionIds) && body.extensionIds.length
      ? body.extensionIds.map(String)
      : null;

    // Only extensions matched to a Beverly user are worth syncing: the dashboard
    // is per-dispatcher, and iterating the full 500+ roster would time out.
    const targets = roster.filter((r) =>
      r.is_active &&
      (requestedIds ? requestedIds.includes(r.rc_extension_id) : !!r.user_id)
    );

    const phoneByExtension = new Map<string, string>();
    const extIdByNumber = new Map<string, string>();
    for (const r of roster) {
      phoneByExtension.set(r.rc_extension_id, r.primary_phone_number ?? "");
      if (r.extension_number) extIdByNumber.set(String(r.extension_number), r.rc_extension_id);
    }

    const { dateFrom: utcFrom, dateTo: utcTo } = localDayRangeToUtc(dateFrom, dateTo, timezone);

    // ---- Calls: account-wide detailed call log ----
    const rawCalls: RawCallRecord[] = [];
    let callPages = 0;
    const callErrors: Array<{ extensionId: string; category: string }> = [];
    let callSource = "account";
    let companyCallLogError: string | null = null;
    let firstExtensionCallLogError: string | null = null;

    const fetchCallLog = async (basePath: string) => {
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await client.request<{ records: RawCallRecord[]; paging?: { totalPages?: number } }>(
          `${basePath}?view=Detailed&perPage=1000&page=${page}` +
            `&dateFrom=${encodeURIComponent(utcFrom)}&dateTo=${encodeURIComponent(utcTo)}`,
        );
        rawCalls.push(...(res.records ?? []));
        callPages = Math.max(callPages, page);
        if (!res.paging?.totalPages || page >= res.paging.totalPages) break;
      }
    };

    try {
      await fetchCallLog("/restapi/v1.0/account/~/call-log");
    } catch (err) {
      // The company call log needs the "Company Call Log" RingCentral *user role*
      // permission. Without it, fall back to per-extension call logs so the sync
      // still returns whatever the authorized user may read.
      const isPermission = err instanceof RingCentralApiError && err.category === "permission";
      if (!isPermission) throw err;
      companyCallLogError = err instanceof Error ? err.message : String(err);
      callSource = "per_extension_fallback";
      console.warn(`[rc-sync] company call log denied: ${companyCallLogError}`);
      let consecutiveDenials = 0;
      for (const target of targets) {
        try {
          await fetchCallLog(`/restapi/v1.0/account/~/extension/${target.rc_extension_id}/call-log`);
          consecutiveDenials = 0;
        } catch (innerErr) {
          const category = innerErr instanceof RingCentralApiError ? innerErr.category : "unknown";
          callErrors.push({ extensionId: target.rc_extension_id, category });
          if (!firstExtensionCallLogError) {
            firstExtensionCallLogError = innerErr instanceof Error ? innerErr.message : String(innerErr);
            console.warn(`[rc-sync] per-extension call log denied: ${firstExtensionCallLogError}`);
          }
          if (category === "permission") consecutiveDenials++;
          // The authorized user cannot read other extensions' logs: stop early
          // instead of burning the whole function timeout on 403s.
          if (consecutiveDenials >= 5) break;
        }
      }
      if (!rawCalls.length) {
        await recordFailure(
          admin,
          scope,
          "permission",
          'RingCentral denied both the company call log and every per-extension call log. Grant the "Company Call Log" permission to the JWT user\'s RingCentral role.',
        );
        return json({
          error: "permission",
          detail: "Company call log and per-extension call logs are all denied.",
          ringcentralCompanyCallLogError: companyCallLogError,
          ringcentralExtensionCallLogError: firstExtensionCallLogError,
          grantedAppScopes: token.scopes,
          missingPermission: "ReadCompanyCallLog (user role permission)",
          action:
            'In the RingCentral admin portal, edit the role of the user who authorized the JWT and enable "Company Call Log" (Reports/Call Log permissions), then re-run the sync.',
        }, 424);
      }
    }

    const calls = dedupeCalls(rawCalls).map((c) => {
      if (c.extensionId) return c;
      // Fallback: resolve the extension from the internal leg's extension number.
      const rawMatch = rawCalls.find((r) => String(r.id ?? "") === c.recordId);
      const extNumber = rawMatch?.from?.extensionNumber ?? rawMatch?.to?.extensionNumber;
      return extNumber ? { ...c, extensionId: extIdByNumber.get(String(extNumber)) ?? null } : c;
    });

    // ---- Messages: per-extension message store (SMS + MMS metadata only) ----
    const messages: NormalizedMessage[] = [];
    const messageErrors: Array<{ extensionId: string; category: string }> = [];

    for (const target of targets) {
      try {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const res = await client.request<{ records: RawMessageRecord[]; paging?: { totalPages?: number } }>(
            `/restapi/v1.0/account/~/extension/${target.rc_extension_id}/message-store` +
              `?messageType=SMS&messageType=MMS&perPage=1000&page=${page}` +
              `&dateFrom=${encodeURIComponent(utcFrom)}&dateTo=${encodeURIComponent(utcTo)}`,
          );
          for (const rec of res.records ?? []) {
            messages.push(normalizeMessage(rec, target.rc_extension_id));
          }
          if (!res.paging?.totalPages || page >= res.paging.totalPages) break;
        }
      } catch (err) {
        if (err instanceof RingCentralApiError && err.category === "permission" && err.missingPermission) {
          throw err; // A missing app permission is fatal, not a partial failure.
        }
        const category = err instanceof RingCentralApiError ? err.category : "unknown";
        messageErrors.push({ extensionId: target.rc_extension_id, category });
        console.error(`[rc-sync] message-store failed for extension ${target.rc_extension_id}: ${category}`);
      }
    }

    const dedupedMessages = dedupeMessages(messages);

    // ---- Persist raw records (idempotent) ----
    const callRows = calls
      .filter((c) => c.recordId)
      .map((c) => ({
        rc_record_id: c.recordId,
        session_id: c.sessionId,
        rc_extension_id: c.extensionId,
        direction: c.direction,
        result: c.result,
        action: c.action,
        duration_seconds: c.durationSeconds,
        live_talk_seconds: c.liveTalkSeconds,
        ring_seconds: c.ringSeconds,
        hold_seconds: c.holdSeconds,
        from_number: c.fromNumber,
        to_number: c.toNumber,
        started_at: c.startedAt,
        metric_date: localDate(c.startedAt, timezone),
      }));

    for (const chunk of chunks(callRows, 500)) {
      const { error } = await admin
        .from("ringcentral_call_records")
        .upsert(chunk, { onConflict: "rc_record_id" });
      if (error) throw error;
    }

    const messageRows = dedupedMessages.map((m) => ({
      rc_message_id: m.messageId,
      conversation_id: m.conversationId,
      rc_extension_id: m.extensionId,
      message_type: m.messageType,
      direction: m.direction,
      message_status: m.messageStatus,
      from_number: m.fromNumber,
      to_numbers: m.toNumbers,
      creation_time: m.creationTime,
      metric_date: localDate(m.creationTime, timezone),
    }));

    for (const chunk of chunks(messageRows, 500)) {
      const { error } = await admin
        .from("ringcentral_message_records")
        .upsert(chunk, { onConflict: "rc_message_id" });
      if (error) throw error;
    }

    // ---- Daily aggregates ----
    const metrics = buildDailyMetrics(calls, dedupedMessages, phoneByExtension, timezone);

    // Attach the matched Beverly user for each extension.
    const { data: matchRows } = await admin
      .from("ringcentral_extensions")
      .select("rc_extension_id, user_id");
    const userByExtension = new Map((matchRows ?? []).map((r) => [r.rc_extension_id, r.user_id]));

    const metricRows = metrics.map((m) => ({
      ...m,
      user_id: userByExtension.get(m.rc_extension_id) ?? null,
      last_synced_at: new Date().toISOString(),
    }));

    for (const chunk of chunks(metricRows, 500)) {
      const { error } = await admin
        .from("ringcentral_phone_metrics")
        .upsert(chunk, { onConflict: "rc_extension_id,ringcentral_phone_number,metric_date" });
      if (error) throw error;
    }

    const partialCount = messageErrors.length + callErrors.length;
    const status = partialCount ? "degraded" : "healthy";
    await admin.from("ringcentral_sync_state").upsert({
      scope,
      status,
      last_successful_sync_at: new Date().toISOString(),
      last_attempted_sync_at: new Date().toISOString(),
      cursor_date: dateTo,
      cursor_page: callPages,
      error_category: partialCount ? "partial" : null,
      error_message: partialCount
        ? [
          messageErrors.length ? `Message store unavailable for ${messageErrors.length} extension(s)` : null,
          callErrors.length ? `Call log unavailable for ${callErrors.length} extension(s)` : null,
        ].filter(Boolean).join("; ")
        : null,
      error_count: partialCount,
    }, { onConflict: "scope" });

    console.log(
      `[rc-sync] ${scope} ${dateFrom}..${dateTo}: ${rawCalls.length} legs -> ${calls.length} calls, ` +
        `${dedupedMessages.length} messages, ${metricRows.length} daily rows, ${messageErrors.length} partial errors`,
    );

    return json({
      scope,
      period: { from: dateFrom, to: dateTo, timezone },
      calls: { legs: rawCalls.length, unique: calls.length, pages: callPages, source: callSource },
      messages: { records: dedupedMessages.length },
      dailyRows: metricRows.length,
      extensionsProcessed: targets.length,
      partialFailures: partialCount,
      status,
    });
  } catch (err) {
    return await handleError(admin, scope, err);
  }
});

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function shiftDate(date: string, deltaDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

async function recordFailure(admin: any, scope: string, category: string, message: string) {
  // Existing metrics are intentionally left untouched: a failed sync must never
  // overwrite valid numbers with zeros.
  const { data: existing } = await admin
    .from("ringcentral_sync_state")
    .select("error_count")
    .eq("scope", scope)
    .maybeSingle();

  await admin.from("ringcentral_sync_state").upsert({
    scope,
    status: "error",
    last_attempted_sync_at: new Date().toISOString(),
    error_category: category,
    error_message: message.slice(0, 500),
    error_count: (existing?.error_count ?? 0) + 1,
  }, { onConflict: "scope" });
}

async function handleError(admin: any, scope: string, err: unknown) {
  if (err instanceof RingCentralConfigError) {
    await recordFailure(admin, scope, "auth", err.message);
    return json({ error: "missing_credentials", missing: err.missing }, 500);
  }
  if (err instanceof RingCentralAuthError) {
    await recordFailure(admin, scope, "auth", err.message);
    return json({ error: "auth_failed", detail: err.message }, 502);
  }
  if (err instanceof RingCentralApiError) {
    await recordFailure(admin, scope, err.category, err.message);
    return json({
      error: err.category,
      detail: err.message,
      missingPermission: err.missingPermission,
      action: err.missingPermission
        ? `Enable the "${err.missingPermission}" application permission in the RingCentral Developer Console and re-authorize the JWT credential.`
        : undefined,
    }, err.category === "permission" ? 424 : 502);
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[rc-sync] ${scope} failed:`, message);
  await recordFailure(admin, scope, "unknown", message);
  return json({ error: "sync_failed", detail: message }, 500);
}
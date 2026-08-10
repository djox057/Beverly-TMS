// Read API for the RingCentral Activity dashboard.
// Admin + manager only. Serves stored aggregates; never calls RingCentral.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { toE164 } from "../_shared/ringcentral/normalize.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ActivityRequest {
  dateFrom?: string;
  dateTo?: string;
  userId?: string | null;
  extensionId?: string | null;
  phoneNumber?: string | null;
  externalNumber?: string | null;
  timezone?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authError } = await authClient.auth.getUser();
    if (authError || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorization: admin + manager only.
    const { data: roleRows } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    const roles = new Set((roleRows ?? []).map((r) => r.role));
    if (!roles.has("admin") && !roles.has("manager")) {
      return json({ error: "Forbidden" }, 403);
    }

    const body: ActivityRequest = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const timezone = body.timezone || "America/Chicago";
    const dateTo = body.dateTo || new Date().toISOString().slice(0, 10);
    const dateFrom = body.dateFrom || dateTo;

    const externalNumber = body.externalNumber ? toE164(body.externalNumber) : null;
    if (body.externalNumber && !externalNumber) {
      return json({ error: "invalid_phone_number" }, 400);
    }

    // Extension roster for labels and filters.
    const { data: extensions } = await admin
      .from("ringcentral_extensions")
      .select("rc_extension_id, extension_number, rc_name, primary_phone_number, user_id, match_method, is_active");

    let allowedExtensionIds: string[] | null = null;
    if (body.userId) {
      allowedExtensionIds = (extensions ?? [])
        .filter((e) => e.user_id === body.userId)
        .map((e) => e.rc_extension_id);
    }
    if (body.extensionId) {
      allowedExtensionIds = (allowedExtensionIds ?? [body.extensionId]).filter(
        (id) => id === body.extensionId,
      );
    }

    // External-number mode: derive counts from raw records instead of aggregates.
    if (externalNumber) {
      const result = await externalNumberActivity(admin, externalNumber, dateFrom, dateTo, allowedExtensionIds);
      const sync = await syncStatus(admin);
      return json({
        period: { from: dateFrom, to: dateTo, timezone },
        phoneNumber: externalNumber,
        extensionId: body.extensionId ?? null,
        ...result,
        sync,
        extensions: extensions ?? [],
        daily: result.daily,
      });
    }

    let query = admin
      .from("ringcentral_phone_metrics")
      .select("*")
      .gte("metric_date", dateFrom)
      .lte("metric_date", dateTo);

    if (allowedExtensionIds) {
      if (!allowedExtensionIds.length) {
        return json({
          period: { from: dateFrom, to: dateTo, timezone },
          phoneNumber: null,
          extensionId: body.extensionId ?? null,
          calls: emptyCalls(),
          messages: emptyMessages(),
          byExtension: [],
          daily: [],
          extensions: extensions ?? [],
          sync: await syncStatus(admin),
        });
      }
      query = query.in("rc_extension_id", allowedExtensionIds);
    }
    if (body.phoneNumber) {
      const e164 = toE164(body.phoneNumber);
      if (e164) query = query.eq("ringcentral_phone_number", e164);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    const metrics = rows ?? [];
    const totals = aggregate(metrics);
    const extensionLabel = new Map(
      (extensions ?? []).map((e) => [e.rc_extension_id, e.rc_name || e.extension_number || e.rc_extension_id]),
    );

    const byExtension = groupBy(metrics, (r) => r.rc_extension_id).map(([extId, group]) => ({
      extensionId: extId,
      label: extensionLabel.get(extId) ?? extId,
      phoneNumber: group[0]?.ringcentral_phone_number || null,
      userId: group[0]?.user_id ?? null,
      ...aggregate(group),
    }));

    const daily = groupBy(metrics, (r) => r.metric_date)
      .map(([date, group]) => ({ date, ...aggregate(group) }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return json({
      period: { from: dateFrom, to: dateTo, timezone },
      phoneNumber: body.phoneNumber ? toE164(body.phoneNumber) : null,
      extensionId: body.extensionId ?? null,
      ...totals,
      byExtension,
      daily,
      extensions: extensions ?? [],
      sync: await syncStatus(admin),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[rc-activity] failed:", message);
    return json({ error: "activity_failed", detail: message }, 500);
  }
});

function emptyCalls() {
  return {
    total: 0,
    inbound: 0,
    outbound: 0,
    answered: 0,
    missed: 0,
    totalDurationSeconds: 0,
    liveTalkSeconds: 0,
    averageAnsweredDurationSeconds: 0,
  };
}

function emptyMessages() {
  return { total: 0, inbound: 0, outbound: 0, failed: 0 };
}

function aggregate(rows: any[]) {
  const calls = emptyCalls();
  const messages = emptyMessages();
  let answeredSeconds = 0;

  for (const r of rows) {
    calls.inbound += r.inbound_calls ?? 0;
    calls.outbound += r.outbound_calls ?? 0;
    calls.answered += r.answered_calls ?? 0;
    calls.missed += r.missed_calls ?? 0;
    calls.totalDurationSeconds += r.total_call_seconds ?? 0;
    calls.liveTalkSeconds += r.live_talk_seconds ?? 0;
    answeredSeconds += (r.average_answered_call_seconds ?? 0) * (r.answered_calls ?? 0);
    messages.inbound += r.inbound_sms ?? 0;
    messages.outbound += r.outbound_sms ?? 0;
    messages.failed += r.failed_sms ?? 0;
  }

  calls.total = calls.inbound + calls.outbound;
  calls.averageAnsweredDurationSeconds = calls.answered > 0 ? Math.round(answeredSeconds / calls.answered) : 0;
  messages.total = messages.inbound + messages.outbound;

  return { calls, messages };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (!k) continue;
    const list = map.get(k) ?? [];
    list.push(row);
    map.set(k, list);
  }
  return [...map.entries()];
}

async function externalNumberActivity(
  admin: any,
  externalNumber: string,
  dateFrom: string,
  dateTo: string,
  extensionIds: string[] | null,
) {
  let callQuery = admin
    .from("ringcentral_call_records")
    .select("direction, result, duration_seconds, live_talk_seconds, metric_date, rc_extension_id")
    .gte("metric_date", dateFrom)
    .lte("metric_date", dateTo)
    .or(`from_number.eq.${externalNumber},to_number.eq.${externalNumber}`);
  if (extensionIds?.length) callQuery = callQuery.in("rc_extension_id", extensionIds);

  let msgQuery = admin
    .from("ringcentral_message_records")
    .select("direction, message_status, metric_date, rc_extension_id, from_number, to_numbers")
    .gte("metric_date", dateFrom)
    .lte("metric_date", dateTo)
    .or(`from_number.eq.${externalNumber},to_numbers.cs.{${externalNumber}}`);
  if (extensionIds?.length) msgQuery = msgQuery.in("rc_extension_id", extensionIds);

  const [{ data: callRows }, { data: msgRows }] = await Promise.all([callQuery, msgQuery]);

  const calls = emptyCalls();
  const messages = emptyMessages();
  let answeredSeconds = 0;
  const dailyMap = new Map<string, { calls: number; messages: number }>();

  for (const c of callRows ?? []) {
    if (c.direction === "Inbound") calls.inbound += 1;
    else if (c.direction === "Outbound") calls.outbound += 1;
    const answered = (c.live_talk_seconds ?? 0) > 0;
    if (answered) {
      calls.answered += 1;
      answeredSeconds += c.live_talk_seconds ?? 0;
    } else {
      calls.missed += 1;
    }
    calls.totalDurationSeconds += c.duration_seconds ?? 0;
    calls.liveTalkSeconds += c.live_talk_seconds ?? 0;
    bump(dailyMap, c.metric_date, "calls");
  }

  for (const m of msgRows ?? []) {
    if (m.direction === "Inbound") messages.inbound += 1;
    else if (m.direction === "Outbound") messages.outbound += 1;
    if (["SendingFailed", "DeliveryFailed", "Failed"].includes(m.message_status)) messages.failed += 1;
    bump(dailyMap, m.metric_date, "messages");
  }

  calls.total = calls.inbound + calls.outbound;
  calls.averageAnsweredDurationSeconds = calls.answered > 0 ? Math.round(answeredSeconds / calls.answered) : 0;
  messages.total = messages.inbound + messages.outbound;

  const daily = [...dailyMap.entries()]
    .map(([date, v]) => ({
      date,
      calls: { ...emptyCalls(), total: v.calls },
      messages: { ...emptyMessages(), total: v.messages },
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return { calls, messages, byExtension: [], daily };
}

function bump(
  map: Map<string, { calls: number; messages: number }>,
  date: string | null,
  kind: "calls" | "messages",
) {
  if (!date) return;
  const entry = map.get(date) ?? { calls: 0, messages: 0 };
  entry[kind] += 1;
  map.set(date, entry);
}

async function syncStatus(admin: any) {
  const { data } = await admin
    .from("ringcentral_sync_state")
    .select("scope, status, last_successful_sync_at, last_attempted_sync_at, error_category, error_message")
    .order("last_attempted_sync_at", { ascending: false });

  const rows = data ?? [];
  const primary = rows.find((r: any) => r.scope !== "extensions") ?? rows[0] ?? null;
  return {
    lastSuccessfulSync: primary?.last_successful_sync_at ?? null,
    lastAttemptedSync: primary?.last_attempted_sync_at ?? null,
    status: primary?.status ?? "never_synced",
    errorCategory: primary?.error_category ?? null,
    errorMessage: primary?.error_message ?? null,
    scopes: rows,
  };
}
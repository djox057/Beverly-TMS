import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { FROM, corsHeaders, escapeHtml, formatDate } from "../_shared/reminders.ts";
import {
  chicagoTodayISO,
  daysSinceMileageUpdate,
  getMileageUpdateStatus,
} from "../_shared/mileageUpdateStatus.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const CC = ["tommyj@bfprime.net", "bob.i@bfprime.net", "kyle@bfprime.net"];
const FALLBACK_TO = ["tommyj@bfprime.net"];

interface Item {
  truckId: string;
  truckNumber: string;
  driverName: string | null;
  lastUpdate: string | null;
  days: number | null;
  status: "yellow" | "red";
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
    } catch {
      // cron invocation, no body
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const today = chicagoTodayISO();

    const { data: trucks, error: trucksError } = await admin
      .from("trucks")
      .select(
        "id, truck_number, miles_updated_at, driver1_id, dispatcher_id, driver1:drivers!trucks_driver1_id_fkey(first_name, last_name, dispatcher_id)",
      )
      .eq("is_active", true);
    if (trucksError) throw trucksError;

    const items: Item[] = [];
    for (const t of (trucks ?? []) as any[]) {
      const status = getMileageUpdateStatus(t.miles_updated_at);
      if (status === "none") continue;
      const dispatcherId = t.driver1?.dispatcher_id ?? t.dispatcher_id ?? null;
      items.push({
        truckId: t.id,
        truckNumber: t.truck_number,
        driverName: t.driver1
          ? `${t.driver1.first_name ?? ""} ${t.driver1.last_name ?? ""}`.trim() || null
          : null,
        lastUpdate: t.miles_updated_at ? String(t.miles_updated_at).slice(0, 10) : null,
        days: daysSinceMileageUpdate(t.miles_updated_at),
        status,
        // deno-lint-ignore no-explicit-any
        ...({ dispatcherId } as any),
      });
    }

    const dispatcherOf = new Map<string, string | null>();
    for (const t of (trucks ?? []) as any[]) {
      dispatcherOf.set(t.id, t.driver1?.dispatcher_id ?? t.dispatcher_id ?? null);
    }

    if (items.length === 0) {
      return new Response(JSON.stringify({ scanned: (trucks ?? []).length, stale: 0, emailsSent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Dedupe: at most one reminder per truck+status per day.
    const { data: logRows } = await admin
      .from("document_reminder_log")
      .select("entity_id, milestone, send_date")
      .eq("field_key", "miles_update")
      .eq("send_date", today);
    const alreadySent = new Set(
      (logRows ?? []).map((r: any) => `${r.entity_id}|${r.milestone}`),
    );

    const pending = items.filter(
      (i) => !alreadySent.has(`${i.truckId}|${i.status === "red" ? 0 : 5}`),
    );
    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ scanned: (trucks ?? []).length, stale: items.length, emailsSent: 0, skipped: items.length }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dispatcherIds = [
      ...new Set(pending.map((i) => dispatcherOf.get(i.truckId)).filter(Boolean)),
    ] as string[];
    const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
    if (dispatcherIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", dispatcherIds);
      for (const p of profiles ?? []) {
        profileMap.set(p.user_id, { email: p.email, full_name: p.full_name });
      }
    }

    const groups = new Map<string, { email: string | null; name: string; items: Item[] }>();
    for (const i of pending) {
      const dispatcherId = dispatcherOf.get(i.truckId) ?? null;
      const profile = dispatcherId ? profileMap.get(dispatcherId) : null;
      const email = profile?.email ?? null;
      const bucket = email ?? "__unassigned__";
      if (!groups.has(bucket)) {
        groups.set(bucket, { email, name: profile?.full_name ?? "Team", items: [] });
      }
      groups.get(bucket)!.items.push(i);
    }

    let emailsSent = 0;
    const failures: string[] = [];
    const logInserts: any[] = [];

    for (const [, group] of groups) {
      const sorted = [...group.items].sort((a, b) => {
        if (a.status !== b.status) return a.status === "red" ? -1 : 1;
        return (b.days ?? 9999) - (a.days ?? 9999);
      });

      const rows = sorted
        .map((i) => {
          const color = i.status === "red" ? "#b91c1c" : "#b45309";
          const label =
            i.status === "red"
              ? i.days == null
                ? "NEVER UPDATED"
                : `OVERDUE — ${i.days} days since last update`
              : "Missed this cycle (1st / 15th)";
          return `<tr>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">Truck ${escapeHtml(i.truckNumber)}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(i.driverName ?? "—")}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatDate(i.lastUpdate))}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:${color};font-weight:600;">${escapeHtml(label)}</td>
</tr>`;
        })
        .join("");

      const redCount = sorted.filter((i) => i.status === "red").length;
      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">
  <h2 style="margin:0 0 4px;">Odometer update reminder</h2>
  <p style="margin:0 0 12px;">Hi ${escapeHtml(group.name)}, mileage must be updated twice a month — on the 1st and on the 15th
  (grace period until the 5th and the 20th). The trucks below are missing an update in Live Oil Change.</p>
  <table style="border-collapse:collapse;width:100%;">
    <thead><tr style="background:#f3f4f6;text-align:left;">
      <th style="padding:6px 10px;">Unit</th><th style="padding:6px 10px;">Driver</th>
      <th style="padding:6px 10px;">Last update</th><th style="padding:6px 10px;">Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;

      const subject = `Odometer update needed - ${sorted.length} truck${sorted.length === 1 ? "" : "s"}${
        redCount ? ` (${redCount} over 30 days)` : ""
      }`;

      if (dryRun) {
        emailsSent++;
        continue;
      }

      const response = await resend.emails.send({
        from: FROM,
        to: group.email ? [group.email] : FALLBACK_TO,
        cc: CC.filter((c) => c !== group.email),
        subject,
        html,
      });

      const errorMessage = (response as any)?.error?.message || null;
      if (errorMessage) {
        console.error(`Resend error for ${group.email ?? "unassigned"}: ${errorMessage}`);
        failures.push(`${group.email ?? "unassigned"}: ${errorMessage}`);
        continue;
      }

      emailsSent++;
      for (const i of sorted) {
        logInserts.push({
          entity_type: "truck",
          entity_id: i.truckId,
          entity_label: `Truck ${i.truckNumber}`,
          field_key: "miles_update",
          milestone: i.status === "red" ? 0 : 5,
          due_date: null,
          send_date: today,
          sent_to: group.email ?? "unassigned",
        });
      }
    }

    if (logInserts.length > 0) {
      const { error: insertError } = await admin.from("document_reminder_log").insert(logInserts);
      if (insertError) console.error("Reminder log insert error:", insertError.message);
    }

    return new Response(
      JSON.stringify({
        scanned: (trucks ?? []).length,
        stale: items.length,
        reminders: pending.length,
        emailsSent,
        failures,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("send-mileage-update-reminders error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

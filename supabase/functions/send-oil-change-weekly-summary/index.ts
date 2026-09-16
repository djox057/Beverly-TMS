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

/** Weekly Monday recap goes to fleet management only. */
const TO = ["tommyj@bfprime.net", "bob.i@bfprime.net", "kyle@bfprime.net"];

/** Same thresholds Live Oil Change uses on screen. */
const thresholds = (source: string | null | undefined): { yellow: number; red: number } => {
  const s = (source ?? "").trim().toUpperCase();
  if (s === "M&K" || s === "MK" || s === "M & K") return { yellow: 32000, red: 35000 };
  if (s === "RYDER") return { yellow: 42000, red: 45000 };
  return { yellow: 26000, red: 28000 };
};

const chicagoHour = (now = new Date()): number =>
  Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", hour12: false }).format(now));

const chicagoWeekday = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "long" }).format(now);

interface OilItem {
  truckNumber: string;
  driverName: string | null;
  dispatcherName: string;
  source: string | null;
  miles: number | null;
  lastOilMiles: number | null;
  milesSince: number;
  overBy: number;
  level: "red" | "yellow";
  lastOilDate: string | null;
  note: string | null;
}

interface StaleItem {
  truckNumber: string;
  driverName: string | null;
  dispatcherName: string;
  lastUpdate: string | null;
  days: number | null;
  level: "red" | "yellow";
  note: string | null;
}

const shell = (title: string, intro: string, body: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">
  <h2 style="margin:0 0 4px;">${escapeHtml(title)}</h2>
  <p style="margin:0 0 14px;color:#374151;">${intro}</p>
  ${body}
  <p style="margin:16px 0 0;font-size:12px;color:#6b7280;">Automatic Monday summary from Live Oil Change · Chicago time.</p>
</div>`;

const groupByDispatcher = <T extends { dispatcherName: string }>(items: T[]): [string, T[]][] => {
  const map = new Map<string, T[]>();
  for (const i of items) {
    if (!map.has(i.dispatcherName)) map.set(i.dispatcherName, []);
    map.get(i.dispatcherName)!.push(i);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

const cell = (value: string, extra = "") =>
  `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;${extra}">${value}</td>`;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let dryRun = false;
    let force = false;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
      force = body?.force === true;
    } catch {
      // cron invocation, no body
    }

    // Two cron entries cover CDT and CST; only the 7 AM Chicago one proceeds.
    if (!force && chicagoHour() !== 7) {
      return new Response(JSON.stringify({ skipped: "not 7 AM Chicago", hour: chicagoHour() }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: trucks, error: trucksError } = await admin
      .from("trucks")
      .select(
        "id, truck_number, source, miles, last_oil_change_miles, oil_change_date, miles_updated_at, oil_change_note, is_active, driver1_id, driver1:drivers!trucks_driver1_id_fkey(first_name, last_name, dispatcher_id)",
      )
      .eq("is_active", true);
    if (trucksError) throw trucksError;

    const rows = (trucks ?? []) as any[];
    const dispatcherIds = [
      ...new Set(rows.map((t) => t.driver1?.dispatcher_id).filter(Boolean)),
    ] as string[];
    const dispatcherNames = new Map<string, string>();
    if (dispatcherIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", dispatcherIds);
      for (const p of profiles ?? []) {
        dispatcherNames.set(p.user_id, p.full_name || p.email || "Dispatcher");
      }
    }

    const oilItems: OilItem[] = [];
    const staleItems: StaleItem[] = [];

    for (const t of rows) {
      const driverName = t.driver1
        ? `${t.driver1.first_name ?? ""} ${t.driver1.last_name ?? ""}`.trim() || null
        : null;
      const dispatcherName = t.driver1?.dispatcher_id
        ? dispatcherNames.get(t.driver1.dispatcher_id) ?? "Dispatcher"
        : "No dispatcher assigned";

      const { yellow, red } = thresholds(t.source);
      if (t.miles != null && t.last_oil_change_miles != null) {
        const milesSince = Number(t.miles) - Number(t.last_oil_change_miles);
        if (milesSince > yellow) {
          const level = milesSince > red ? "red" : "yellow";
          oilItems.push({
            truckNumber: t.truck_number,
            driverName,
            dispatcherName,
            source: t.source,
            miles: t.miles,
            lastOilMiles: t.last_oil_change_miles,
            milesSince,
            overBy: milesSince - (level === "red" ? red : yellow),
            level,
            lastOilDate: t.oil_change_date ? String(t.oil_change_date).slice(0, 10) : null,
            note: (t.oil_change_note ?? "").trim() || null,
          });
        }
      }

      const status = getMileageUpdateStatus(t.miles_updated_at);
      if (status !== "none") {
        staleItems.push({
          truckNumber: t.truck_number,
          driverName,
          dispatcherName,
          lastUpdate: t.miles_updated_at ? String(t.miles_updated_at).slice(0, 10) : null,
          days: daysSinceMileageUpdate(t.miles_updated_at),
          level: status,
          note: (t.oil_change_note ?? "").trim() || null,
        });
      }
    }

    const oilTable = groupByDispatcher(oilItems)
      .map(([dispatcher, items]) => {
        const sorted = [...items].sort((a, b) => b.milesSince - a.milesSince);
        const body = sorted
          .map((i) => {
            const color = i.level === "red" ? "#b91c1c" : "#b45309";
            return `<tr>
${cell(`Truck ${escapeHtml(i.truckNumber)}`)}
${cell(escapeHtml(i.driverName ?? "—"))}
${cell(escapeHtml(i.source ?? "—"))}
${cell(i.miles?.toLocaleString() ?? "—")}
${cell(i.lastOilMiles?.toLocaleString() ?? "—")}
${cell(i.milesSince.toLocaleString(), `color:${color};font-weight:600;`)}
${cell(`+${i.overBy.toLocaleString()}`, `color:${color};`)}
${cell(escapeHtml(formatDate(i.lastOilDate)))}
${cell(escapeHtml(i.note ?? "—"), "white-space:pre-wrap;")}
</tr>`;
          })
          .join("");
        return `<h3 style="margin:18px 0 6px;">${escapeHtml(dispatcher)} — ${sorted.length} truck${sorted.length === 1 ? "" : "s"}</h3>
<table style="border-collapse:collapse;width:100%;">
  <thead><tr style="background:#f3f4f6;text-align:left;">
    <th style="padding:6px 10px;">Unit</th><th style="padding:6px 10px;">Driver</th>
    <th style="padding:6px 10px;">Source</th><th style="padding:6px 10px;">Total miles</th>
    <th style="padding:6px 10px;">Last oil change miles</th><th style="padding:6px 10px;">Miles since</th>
    <th style="padding:6px 10px;">Over limit by</th><th style="padding:6px 10px;">Last oil change</th>
    <th style="padding:6px 10px;">Note</th>
  </tr></thead>
  <tbody>${body}</tbody>
</table>`;
      })
      .join("");

    const staleTable = groupByDispatcher(staleItems)
      .map(([dispatcher, items]) => {
        const sorted = [...items].sort((a, b) => (b.days ?? 99999) - (a.days ?? 99999));
        const body = sorted
          .map((i) => {
            const color = i.level === "red" ? "#b91c1c" : "#b45309";
            const label =
              i.level === "red"
                ? i.days == null
                  ? "NEVER UPDATED"
                  : `No update in ${i.days} days`
                : "Missed this cycle (1st / 15th)";
            return `<tr>
${cell(`Truck ${escapeHtml(i.truckNumber)}`)}
${cell(escapeHtml(i.driverName ?? "—"))}
${cell(escapeHtml(formatDate(i.lastUpdate)))}
${cell(i.days == null ? "—" : String(i.days))}
${cell(escapeHtml(label), `color:${color};font-weight:600;`)}
${cell(escapeHtml(i.note ?? "—"), "white-space:pre-wrap;")}
</tr>`;
          })
          .join("");
        return `<h3 style="margin:18px 0 6px;">${escapeHtml(dispatcher)} — ${sorted.length} truck${sorted.length === 1 ? "" : "s"}</h3>
<table style="border-collapse:collapse;width:100%;">
  <thead><tr style="background:#f3f4f6;text-align:left;">
    <th style="padding:6px 10px;">Unit</th><th style="padding:6px 10px;">Driver</th>
    <th style="padding:6px 10px;">Last update</th><th style="padding:6px 10px;">Days</th>
    <th style="padding:6px 10px;">Status</th>
    <th style="padding:6px 10px;">Note</th>
  </tr></thead>
  <tbody>${body}</tbody>
</table>`;
      })
      .join("");

    const today = chicagoTodayISO();
    const oilHtml = shell(
      "Trucks overdue for an oil change",
      `Grouped by dispatcher. Limits follow the truck source: BF Truck 26,000 / 28,000 miles, M&amp;K 32,000 / 35,000, Ryder 42,000 / 45,000.`,
      oilItems.length ? oilTable : "<p>No truck is over its oil change limit right now.</p>",
    );
    const staleHtml = shell(
      "Odometer readings not updated in Live Oil Change",
      `Mileage must be updated twice a month — on the 1st and the 15th, with a grace period until the 5th and the 20th. Red means no update in over 30 days.`,
      staleItems.length ? staleTable : "<p>Every active truck has an up-to-date odometer reading.</p>",
    );

    const emails = [
      {
        subject: `Oil change overdue — ${oilItems.length} truck${oilItems.length === 1 ? "" : "s"} (${today})`,
        html: oilHtml,
      },
      {
        subject: `Odometer not updated — ${staleItems.length} truck${staleItems.length === 1 ? "" : "s"} (${today})`,
        html: staleHtml,
      },
    ];

    const failures: string[] = [];
    let emailsSent = 0;
    if (!dryRun) {
      for (const email of emails) {
        const response = await resend.emails.send({ from: FROM, to: TO, subject: email.subject, html: email.html });
        const errorMessage = (response as any)?.error?.message || null;
        if (errorMessage) {
          console.error(`Resend error: ${errorMessage}`);
          failures.push(errorMessage);
          continue;
        }
        emailsSent++;
      }
    }

    return new Response(
      JSON.stringify({
        weekday: chicagoWeekday(),
        scanned: rows.length,
        oilOverdue: oilItems.length,
        staleMileage: staleItems.length,
        emailsSent,
        failures,
        dryRun,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("send-oil-change-weekly-summary failed:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

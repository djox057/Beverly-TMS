import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  FROM,
  corsHeaders,
  chicagoTodayISO,
  daysUntil,
  escapeHtml,
  formatDate,
  getOilChangeThresholds,
  milestoneFor,
  milestoneLabel,
  reminderKey,
  routeRecipients,
} from "../_shared/reminders.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface Candidate {
  entityType: "truck" | "trailer" | "driver" | "temp_plate";
  entityId: string;
  entityLabel: string;
  unit: string;
  driverName: string | null;
  document: string;
  fieldKey: string;
  dueDate: string | null;
  days: number | null;
  milestone: number;
  detail?: string;
  dispatcherId: string | null;
}

const TRUCK_FIELDS: { key: string; label: string }[] = [
  { key: "dot_inspection_date", label: "DOT Inspection" },
  { key: "plate_expiration_date", label: "Plate" },
  { key: "insurance_expiration_date", label: "Insurance" },
  { key: "registration_expiration_date", label: "Stickers / Registration" },
  { key: "maintenance_check_date", label: "Maintenance Check" },
];

const TRAILER_FIELDS: { key: string; label: string }[] = [
  { key: "dot_inspection_date", label: "DOT Inspection" },
  { key: "plate_expiration_date", label: "Plate" },
  { key: "insurance_expiration_date", label: "Insurance" },
];

const DRIVER_FIELDS: { key: string; label: string }[] = [
  { key: "cdl_expiration_date", label: "CDL" },
  { key: "medical_card_expiration_date", label: "Medical Card" },
  { key: "mvr_date", label: "MVR" },
  { key: "clearing_house", label: "Clearinghouse" },
  { key: "random_drug_test_date", label: "Random Drug Test" },
];

const TEMP_PLATE_VALID_DAYS = 30;

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let dryRun = false;
    try {
      const body = await req.json();
      dryRun = body?.dryRun === true;
    } catch {
      // no body -> cron invocation
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const today = chicagoTodayISO();

    const [trucksRes, trailersRes, driversRes, platesRes] = await Promise.all([
      admin
        .from("trucks")
        .select(
          "id, truck_number, source, miles, last_oil_change_miles, dispatcher_id, driver1_id, trailer_id, dot_inspection_date, plate_expiration_date, insurance_expiration_date, registration_expiration_date, maintenance_check_date",
        )
        .eq("is_active", true),
      admin
        .from("trailers")
        .select(
          "id, trailer_number, dot_inspection_date, plate_expiration_date, insurance_expiration_date",
        )
        .eq("is_active", true),
      admin
        .from("drivers")
        .select(
          "id, name, dispatcher_id, cdl_expiration_date, medical_card_expiration_date, mvr_date, clearing_house, random_drug_test_date",
        )
        .eq("is_active", true),
      admin.from("temporary_plates").select("id, truck_id, created_at"),
    ]);

    if (trucksRes.error) throw trucksRes.error;
    if (trailersRes.error) throw trailersRes.error;
    if (driversRes.error) throw driversRes.error;
    if (platesRes.error) throw platesRes.error;

    const trucks = trucksRes.data ?? [];
    const trailers = trailersRes.data ?? [];
    const drivers = driversRes.data ?? [];
    const plates = platesRes.data ?? [];

    const driverById = new Map(drivers.map((d: any) => [d.id, d]));
    const truckById = new Map(trucks.map((t: any) => [t.id, t]));
    const truckByTrailerId = new Map<string, any>();
    for (const t of trucks as any[]) if (t.trailer_id) truckByTrailerId.set(t.trailer_id, t);

    const dispatcherForTruck = (truck: any): string | null => {
      const driver = truck?.driver1_id ? driverById.get(truck.driver1_id) : null;
      return driver?.dispatcher_id ?? truck?.dispatcher_id ?? null;
    };

    const candidates: Candidate[] = [];
    let scanned = 0;

    // ---- Trucks ----
    for (const truck of trucks as any[]) {
      const driver = truck.driver1_id ? driverById.get(truck.driver1_id) : null;
      const dispatcherId = dispatcherForTruck(truck);
      for (const f of TRUCK_FIELDS) {
        scanned++;
        const days = daysUntil(truck[f.key]);
        const milestone = milestoneFor(days);
        if (milestone === null) continue;
        candidates.push({
          entityType: "truck",
          entityId: truck.id,
          entityLabel: `Truck ${truck.truck_number}`,
          unit: `Truck ${truck.truck_number}`,
          driverName: driver?.name ?? null,
          document: f.label,
          fieldKey: f.key,
          dueDate: String(truck[f.key]).slice(0, 10),
          days,
          milestone,
          dispatcherId,
        });
      }

      // Oil change (mileage based, no due date)
      if (truck.miles != null && truck.last_oil_change_miles != null) {
        const since = truck.miles - truck.last_oil_change_miles;
        const { yellow, red } = getOilChangeThresholds(truck.source);
        const milestone = since > red ? 1 : since > yellow ? 14 : null;
        if (milestone !== null) {
          candidates.push({
            entityType: "truck",
            entityId: truck.id,
            entityLabel: `Truck ${truck.truck_number}`,
            unit: `Truck ${truck.truck_number}`,
            driverName: driver?.name ?? null,
            document: "Oil Change",
            fieldKey: "oil_change",
            dueDate: null,
            days: null,
            milestone,
            detail: `${since.toLocaleString("en-US")} mi since last oil change (limit ${red.toLocaleString("en-US")})`,
            dispatcherId,
          });
        }
      }
    }

    // ---- Trailers ----
    for (const trailer of trailers as any[]) {
      const truck = truckByTrailerId.get(trailer.id);
      const driver = truck?.driver1_id ? driverById.get(truck.driver1_id) : null;
      const dispatcherId = truck ? dispatcherForTruck(truck) : null;
      for (const f of TRAILER_FIELDS) {
        scanned++;
        const days = daysUntil(trailer[f.key]);
        const milestone = milestoneFor(days);
        if (milestone === null) continue;
        candidates.push({
          entityType: "trailer",
          entityId: trailer.id,
          entityLabel: `Trailer ${trailer.trailer_number}`,
          unit: truck
            ? `Trailer ${trailer.trailer_number} (Truck ${truck.truck_number})`
            : `Trailer ${trailer.trailer_number}`,
          driverName: driver?.name ?? null,
          document: f.label,
          fieldKey: f.key,
          dueDate: String(trailer[f.key]).slice(0, 10),
          days,
          milestone,
          dispatcherId,
        });
      }
    }

    // ---- Drivers ----
    for (const driver of drivers as any[]) {
      for (const f of DRIVER_FIELDS) {
        scanned++;
        const days = daysUntil(driver[f.key]);
        const milestone = milestoneFor(days);
        if (milestone === null) continue;
        candidates.push({
          entityType: "driver",
          entityId: driver.id,
          entityLabel: driver.name,
          unit: driver.name,
          driverName: driver.name,
          document: f.label,
          fieldKey: f.key,
          dueDate: String(driver[f.key]).slice(0, 10),
          days,
          milestone,
          dispatcherId: driver.dispatcher_id ?? null,
        });
      }
    }

    // ---- Temporary plates (valid ~30 days from when they were added) ----
    for (const plate of plates as any[]) {
      scanned++;
      const created = new Date(String(plate.created_at));
      const due = new Date(created.getTime() + TEMP_PLATE_VALID_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
      const days = daysUntil(due);
      const milestone = milestoneFor(days);
      if (milestone === null) continue;
      const truck = plate.truck_id ? truckById.get(plate.truck_id) : null;
      const driver = truck?.driver1_id ? driverById.get(truck.driver1_id) : null;
      candidates.push({
        entityType: "temp_plate",
        entityId: plate.id,
        entityLabel: truck ? `Truck ${truck.truck_number}` : "Temporary plate",
        unit: truck ? `Truck ${truck.truck_number}` : "Temporary plate",
        driverName: driver?.name ?? null,
        document: "Temporary Plate",
        fieldKey: "temp_plate",
        dueDate: due,
        days,
        milestone,
        dispatcherId: truck ? dispatcherForTruck(truck) : null,
      });
    }

    const milestonesHit = candidates.length;

    // ---- Dedupe against the reminder log ----
    const { data: logRows, error: logError } = await admin
      .from("document_reminder_log")
      .select("entity_type, entity_id, field_key, milestone, due_date, send_date")
      .in("entity_type", ["truck", "trailer", "driver", "temp_plate"])
      .gte("sent_at", new Date(Date.now() - 400 * 86400000).toISOString());
    if (logError) throw logError;

    const sentKeys = new Set(
      (logRows ?? []).map((r: any) =>
        reminderKey(r.entity_type, r.entity_id, r.field_key, r.milestone, r.due_date, r.send_date),
      ),
    );
    // Oil change has no due date: don't repeat the same milestone within 30 days.
    const recentOil = new Set(
      (logRows ?? [])
        .filter(
          (r: any) =>
            r.field_key === "oil_change" &&
            new Date(r.send_date).getTime() > Date.now() - 30 * 86400000,
        )
        .map((r: any) => `${r.entity_id}|${r.milestone}`),
    );

    const pending = candidates.filter((c) => {
      if (c.fieldKey === "oil_change" && recentOil.has(`${c.entityId}|${c.milestone}`)) return false;
      return !sentKeys.has(
        reminderKey(c.entityType, c.entityId, c.fieldKey, c.milestone, c.dueDate, today),
      );
    });

    if (pending.length === 0) {
      return new Response(
        JSON.stringify({ scanned, milestonesHit, emailsSent: 0, skipped: milestonesHit, reminders: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Resolve dispatcher emails ----
    const dispatcherIds = [...new Set(pending.map((c) => c.dispatcherId).filter(Boolean))] as string[];
    const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
    if (dispatcherIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", dispatcherIds);
      for (const p of profiles ?? []) profileMap.set(p.user_id, { email: p.email, full_name: p.full_name });
    }

    // ---- Group per dispatcher (unresolved -> safety fallback bucket) ----
    const groups = new Map<string, { email: string | null; name: string; items: Candidate[] }>();
    for (const c of pending) {
      const profile = c.dispatcherId ? profileMap.get(c.dispatcherId) : null;
      const email = profile?.email ?? null;
      const bucket = email ?? "__unassigned__";
      if (!groups.has(bucket)) {
        groups.set(bucket, {
          email,
          name: profile?.full_name ?? "Safety / Maintenance",
          items: [],
        });
      }
      groups.get(bucket)!.items.push(c);
    }

    let emailsSent = 0;
    const failures: string[] = [];
    const logInserts: any[] = [];

    for (const [, group] of groups) {
      const sorted = [...group.items].sort((a, b) => {
        const av = a.milestone <= 0 ? -1 : a.milestone;
        const bv = b.milestone <= 0 ? -1 : b.milestone;
        return av - bv;
      });
      const recipients = routeRecipients(group.email ? [group.email] : []);

      const rows = sorted
        .map((c) => {
          const overdue = c.milestone <= 0;
          const color = overdue ? "#b91c1c" : c.milestone <= 7 ? "#b45309" : "#111827";
          return `<tr>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(c.unit)}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(c.driverName ?? "—")}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(c.document)}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(c.detail ?? formatDate(c.dueDate))}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:${color};font-weight:600;">${escapeHtml(
            milestoneLabel(c.milestone, c.days),
          )}</td>
</tr>`;
        })
        .join("");

      const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;">
  ${recipients.banner ? `<p style="background:#fef3c7;padding:8px;border-radius:4px;">${escapeHtml(recipients.banner)}</p>` : ""}
  <h2 style="margin:0 0 4px;">Safety &amp; Maintenance reminder</h2>
  <p style="margin:0 0 12px;">Hi ${escapeHtml(group.name)}, the following documents for your trucks/drivers need attention.
  Please tell the driver to bring the unit to the yard or send the updated document before the date below.</p>
  <table style="border-collapse:collapse;width:100%;">
    <thead><tr style="background:#f3f4f6;text-align:left;">
      <th style="padding:6px 10px;">Unit</th><th style="padding:6px 10px;">Driver</th>
      <th style="padding:6px 10px;">Document</th><th style="padding:6px 10px;">Due</th>
      <th style="padding:6px 10px;">Status</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;

      const overdueCount = sorted.filter((c) => c.milestone <= 0).length;
      const subject = `Safety & Maintenance - ${sorted.length} item${sorted.length === 1 ? "" : "s"} need attention${
        overdueCount ? ` (${overdueCount} overdue)` : ""
      }`;

      const response = await resend.emails.send({
        from: FROM,
        to: recipients.to,
        ...(recipients.cc ? { cc: recipients.cc } : {}),
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
      for (const c of sorted) {
        logInserts.push({
          entity_type: c.entityType,
          entity_id: c.entityId,
          entity_label: c.entityLabel,
          field_key: c.fieldKey,
          milestone: c.milestone,
          due_date: c.dueDate,
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
        scanned,
        milestonesHit,
        reminders: pending.length,
        emailsSent,
        skipped: milestonesHit - pending.length,
        failures,
        testMode: !!routeRecipients([]).banner,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("send-document-reminders error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
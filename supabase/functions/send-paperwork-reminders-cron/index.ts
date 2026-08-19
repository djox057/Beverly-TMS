import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  FROM,
  chicagoTodayISO,
  corsHeaders,
  daysUntil,
  formatDate,
  reminderKey,
  routeRecipients,
} from "../_shared/reminders.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Paperwork milestones: 7 / 3 / 1 days before the last day, then daily while overdue.
const PAPERWORK_MILESTONES = [7, 3, 1];

const milestoneFor = (days: number | null): number | null => {
  if (days === null) return null;
  if (days < 0) return 0;
  return PAPERWORK_MILESTONES.includes(days) ? days : null;
};

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

    const { data: items, error } = await admin
      .from("paperwork_items")
      .select("id, unit_label, last_day, last_day_text, reason, note")
      .not("last_day", "is", null);
    if (error) throw error;

    const pending = (items ?? [])
      .map((item: any) => {
        const days = daysUntil(item.last_day);
        return { item, days, milestone: milestoneFor(days) };
      })
      .filter((row) => row.milestone !== null);

    const { data: logRows, error: logError } = await admin
      .from("document_reminder_log")
      .select("entity_type, entity_id, field_key, milestone, due_date, send_date")
      .eq("entity_type", "paperwork")
      .gte("sent_at", new Date(Date.now() - 400 * 86400000).toISOString());
    if (logError) throw logError;

    const sentKeys = new Set(
      (logRows ?? []).map((r: any) =>
        reminderKey(r.entity_type, r.entity_id, r.field_key, r.milestone, r.due_date, r.send_date),
      ),
    );

    const toSend = pending.filter(
      (row) =>
        !sentKeys.has(
          reminderKey(
            "paperwork",
            row.item.id,
            "last_day",
            row.milestone!,
            String(row.item.last_day).slice(0, 10),
            today,
          ),
        ),
    );

    let emailsSent = 0;
    const failures: string[] = [];

    for (const row of toSend) {
      const { item, days, milestone } = row;
      const tokens = (String(item.unit_label).match(/\d{3,}/g) || []).slice(0, 4);

      let truckNumber: string | null = null;
      let trailerNumber: string | null = null;
      let driverName: string | null = null;
      let dispatcherName: string | null = null;
      let dispatcherEmail: string | null = null;

      for (const token of tokens) {
        if (!truckNumber) {
          const { data: truck } = await admin
            .from("trucks")
            .select("truck_number, driver1_id, dispatcher_id")
            .eq("truck_number", token)
            .maybeSingle();
          if (truck) {
            truckNumber = truck.truck_number;
            let dispatcherId: string | null = truck.dispatcher_id ?? null;
            if (truck.driver1_id) {
              const { data: driver } = await admin
                .from("drivers")
                .select("name, dispatcher_id")
                .eq("id", truck.driver1_id)
                .maybeSingle();
              if (driver) {
                driverName = driver.name;
                dispatcherId = driver.dispatcher_id ?? dispatcherId;
              }
            }
            if (dispatcherId) {
              const { data: profile } = await admin
                .from("profiles")
                .select("full_name, email")
                .eq("user_id", dispatcherId)
                .maybeSingle();
              if (profile) {
                dispatcherName = profile.full_name;
                dispatcherEmail = profile.email;
              }
            }
            continue;
          }
        }
        if (!trailerNumber) {
          const { data: trailer } = await admin
            .from("trailers")
            .select("trailer_number")
            .eq("trailer_number", token)
            .maybeSingle();
          if (trailer) trailerNumber = trailer.trailer_number;
        }
      }

      const dueDate = formatDate(item.last_day) || item.last_day_text || "ASAP";
      const recipients = routeRecipients(dispatcherEmail ? [dispatcherEmail] : []);
      if (dryRun) {
        emailsSent++;
        continue;
      }
      const statusText =
        milestone! > 0
          ? `REMINDER: ${milestone} day${milestone === 1 ? "" : "s"} left`
          : `REMINDER: OVERDUE by ${Math.abs(days ?? 0)} day${Math.abs(days ?? 0) === 1 ? "" : "s"}`;

      const lines = [
        statusText,
        "",
        `Unit: ${item.unit_label}`,
        truckNumber ? `Truck: ${truckNumber}` : null,
        trailerNumber ? `Trailer: ${trailerNumber}` : null,
        driverName ? `Driver: ${driverName}` : null,
        dispatcherName || dispatcherEmail
          ? `Dispatcher: ${dispatcherName || ""}${dispatcherEmail ? ` <${dispatcherEmail}>` : ""}`.trim()
          : null,
        item.reason ? `Reason: ${item.reason}` : null,
        item.note ? `Note: ${item.note}` : null,
        "",
        `ACTION REQUIRED: Please route the driver through the yard with the truck/trailer by ${dueDate}.`,
        "",
        recipients.banner ? `(${recipients.banner})` : null,
      ].filter(Boolean);

      const response = await resend.emails.send({
        from: FROM,
        to: recipients.to,
        ...(recipients.cc ? { cc: recipients.cc } : {}),
        subject: `${statusText} - Paperwork - ${item.unit_label} - bring to yard by ${dueDate}`,
        text: lines.join("\n"),
      });

      const errorMessage = (response as any)?.error?.message || null;
      if (errorMessage) {
        console.error(`Resend error for paperwork ${item.id}: ${errorMessage}`);
        failures.push(`${item.unit_label}: ${errorMessage}`);
        continue;
      }

      emailsSent++;
      const { error: insertError } = await admin.from("document_reminder_log").insert({
        entity_type: "paperwork",
        entity_id: item.id,
        entity_label: item.unit_label,
        field_key: "last_day",
        milestone: milestone!,
        due_date: String(item.last_day).slice(0, 10),
        send_date: today,
        sent_to: dispatcherEmail ?? "unassigned",
      });
      if (insertError) console.error("Reminder log insert error:", insertError.message);
    }

    return new Response(
      JSON.stringify({
        scanned: (items ?? []).length,
        milestonesHit: pending.length,
        reminders: toSend.length,
        emailsSent,
        skipped: pending.length - toSend.length,
        failures,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("send-paperwork-reminders-cron error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
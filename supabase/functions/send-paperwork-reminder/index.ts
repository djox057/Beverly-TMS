import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.23.8";
import { FROM, routeRecipients } from "../_shared/reminders.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({
  unitLabel: z.string().trim().min(1).max(200),
  lastDay: z.string().trim().max(40).nullish(),
  lastDayText: z.string().trim().max(120).nullish(),
  reason: z.string().trim().max(500).nullish(),
  note: z.string().trim().max(1000).nullish(),
  mode: z.enum(["created", "milestone"]).nullish(),
  milestone: z.number().int().nullish(),
  paperworkId: z.string().uuid().nullish(),
});

const formatDate = (value?: string | null) => {
  if (!value) return null;
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${m}/${d}/${y}`;
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { unitLabel, lastDay, lastDayText, reason, note, mode, milestone, paperworkId } = parsed.data;
    const admin = createClient(supabaseUrl, serviceKey);

    // Extract candidate unit numbers from labels like "(8495) 096201"
    const tokens = (unitLabel.match(/\d{3,}/g) || []).slice(0, 4);

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

    const dueDate = formatDate(lastDay) || lastDayText || "ASAP";

    const recipients = routeRecipients(dispatcherEmail ? [dispatcherEmail] : []);
    const milestoneText =
      mode === "milestone"
        ? milestone != null && milestone > 0
          ? `REMINDER: ${milestone} day${milestone === 1 ? "" : "s"} left`
          : "REMINDER: OVERDUE"
        : null;

    const lines = [
      milestoneText ?? "Paperwork reminder",
      "",
      `Unit: ${unitLabel}`,
      truckNumber ? `Truck: ${truckNumber}` : null,
      trailerNumber ? `Trailer: ${trailerNumber}` : null,
      driverName ? `Driver: ${driverName}` : null,
      dispatcherName || dispatcherEmail
        ? `Dispatcher: ${dispatcherName || ""}${dispatcherEmail ? ` <${dispatcherEmail}>` : ""}`.trim()
        : null,
      reason ? `Reason: ${reason}` : null,
      note ? `Note: ${note}` : null,
      "",
      `ACTION REQUIRED: Please route the driver through the yard with the truck/trailer by ${dueDate}.`,
      "",
      `Requested by: ${userData.user.email ?? "unknown"}`,
      "",
      recipients.banner ? `(${recipients.banner})` : null,
    ].filter(Boolean);

    const response = await resend.emails.send({
      from: FROM,
      to: recipients.to,
      ...(recipients.cc ? { cc: recipients.cc } : {}),
      subject: `${milestoneText ? `${milestoneText} - ` : ""}Paperwork Reminder - ${unitLabel} - bring to yard by ${dueDate}`,
      text: lines.join("\n"),
    });

    const errorMessage = (response as any)?.error?.message || null;
    if (errorMessage) {
      console.error("Resend error:", errorMessage);
      return new Response(JSON.stringify({ success: false, error: errorMessage }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (paperworkId) {
      const { error: logError } = await admin.from("document_reminder_log").insert({
        entity_type: "paperwork",
        entity_id: paperworkId,
        entity_label: unitLabel,
        field_key: "last_day",
        milestone: mode === "milestone" ? (milestone ?? 0) : 999,
        due_date: lastDay ? String(lastDay).slice(0, 10) : null,
        sent_to: dispatcherEmail ?? "unassigned",
      });
      if (logError) console.error("Reminder log insert error:", logError.message);
    }

    return new Response(
      JSON.stringify({ success: true, to: recipients.to, cc: recipients.cc ?? [], resolvedDispatcher: dispatcherEmail }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("send-paperwork-reminder error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

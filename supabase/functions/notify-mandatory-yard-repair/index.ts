import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/reminders.ts";
import { repairEmail, sendRepairEmail } from "./delivery.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError || !user) return json({ error: "Authentication required" }, 401);
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: roles, error: rolesError } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  if (rolesError || !roles?.some(row => ["admin", "manager", "maintenance"].includes(row.role))) return json({ error: "Maintenance access required" }, 403);
  let taskId: string;
  let dryRun = false;
  try {
    const body = await req.json(); taskId = body.taskId; dryRun = body.dryRun === true;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId)) return json({ error: "Invalid task ID" }, 400);
  } catch { return json({ error: "Invalid request" }, 400); }
  const { data: task, error: taskError } = await client.from("mandatory_yard_repairs").select("*").eq("id", taskId).maybeSingle();
  if (taskError || !task) return json({ error: "Task not found" }, 404);
  if (task.dispatch_email_sent_at) return json({ sent: true, alreadySent: true });
  if (task.service_type !== "mandatory_yard_repair" || !["pending", "in_progress"].includes(task.status)) return json({ error: "Only open mandatory repairs can be notified" }, 409);
  let claimed = false;
  try {
    const { data: truck, error: truckError } = await admin.from("trucks").select("truck_number,driver1_id,driver2_id,dispatcher_id").eq("id", task.truck_id).single();
    if (truckError || !truck) throw new Error("Truck is unavailable.");
    const driverId = truck.driver1_id || truck.driver2_id;
    if (!driverId) throw new Error("No driver is assigned to this unit.");
    const { data: driver, error: driverError } = await admin.from("drivers").select("name,dispatcher_id").eq("id", driverId).single();
    if (driverError || !driver) throw new Error("Assigned driver is unavailable.");
    const dispatcherId = driver.dispatcher_id || truck.dispatcher_id;
    if (!dispatcherId) throw new Error("No dispatcher is assigned to this unit.");
    const { data: dispatcher, error: dispatcherError } = await admin.from("profiles").select("email").eq("user_id", dispatcherId).single();
    if (dispatcherError || !dispatcher?.email) throw new Error("Assigned dispatcher has no email address.");
    const payload = task.dispatch_email_payload || repairEmail({ unit: truck.truck_number, driverName: driver.name, dispatcherEmail: dispatcher.email, description: task.description, dueDate: task.due_date, reportedDate: task.reported_date, reportedBy: task.reported_by_name });
    if (dryRun) return json({ dryRun: true, to: payload.to, replyTo: payload.reply_to, subject: payload.subject });
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("Email service is not configured.");
    const staleClaim = new Date(Date.now() - 120_000).toISOString();
    const { data: claim, error: claimError } = await admin.from("mandatory_yard_repairs")
      .update({ dispatch_email_claimed_at: new Date().toISOString(), dispatch_email_payload: payload, dispatch_email_error: null })
      .eq("id", taskId).is("dispatch_email_sent_at", null).in("status", ["pending", "in_progress"])
      .or(`dispatch_email_claimed_at.is.null,dispatch_email_claimed_at.lt.${staleClaim}`).select("id").maybeSingle();
    if (claimError) throw new Error("Could not start email delivery.");
    if (!claim) return json({ error: "Notification is already being processed. Please retry shortly." }, 409);
    claimed = true;
    await sendRepairEmail(payload, taskId, apiKey);
    const { error: sentError } = await admin.from("mandatory_yard_repairs").update({ dispatch_email_sent_at: new Date().toISOString(), dispatch_email_claimed_at: null, dispatch_email_error: null, dispatch_informed: true }).eq("id", taskId);
    if (sentError) throw new Error("Email accepted, but delivery status could not be saved. Retry to reconcile.");
    return json({ sent: true });
  } catch (error) {
    const message = error instanceof Error && error.name !== "TimeoutError" ? error.message : "Email delivery timed out. Please retry.";
    if (!dryRun) await admin.from("mandatory_yard_repairs").update({ dispatch_email_error: message, ...(claimed ? { dispatch_email_claimed_at: null } : {}) }).eq("id", taskId).is("dispatch_email_sent_at", null);
    return json({ error: message }, 400);
  }
});

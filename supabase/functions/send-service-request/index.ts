import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@4.0.1";
import { validateServiceRequestPhotos } from "./photos.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const bounded = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length <= max ? value.trim() : null;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return json({ error: "Sign in required" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authClient = createClient(url, anonKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey);
    const { data: roles, error: rolesError } = await admin.from("user_roles")
      .select("role").eq("user_id", user.id).in("role", ["admin", "manager", "dispatch"]);
    if (rolesError) throw rolesError;
    if (!roles?.length) return json({ error: "Not permitted to submit service requests" }, 403);

    const body = await req.json();
    if (!uuid(body?.truckId) || !uuid(body?.driverId) || !["preview", "send"].includes(body?.action)) {
      return json({ error: "Invalid service request" }, 400);
    }

    const [truckResult, driverResult] = await Promise.all([
      admin.from("trucks").select("id, truck_number, trailer_id, driver1_id, driver2_id")
        .eq("id", body.truckId).maybeSingle(),
      admin.from("drivers").select("id, name").eq("id", body.driverId).maybeSingle(),
    ]);
    if (truckResult.error || driverResult.error) throw truckResult.error || driverResult.error;
    const truck = truckResult.data;
    const driver = driverResult.data;
    if (!truck || !driver || (truck.driver1_id !== driver.id && truck.driver2_id !== driver.id)) {
      return json({ error: "Driver is no longer assigned to this truck. Refresh Reports." }, 409);
    }

    const trailerResult = truck.trailer_id
      ? await admin.from("trailers").select("trailer_number").eq("id", truck.trailer_id).maybeSingle()
      : { data: null, error: null };
    if (trailerResult.error) throw trailerResult.error;
    if (body.action === "preview") return json({
      driverName: driver.name,
      truckNumber: truck.truck_number,
      trailerNumber: trailerResult.data?.trailer_number || "",
      // Legacy published forms still read these fields until the new UI is published.
      suggestedUnderLoad: null,
      suggestedOrderId: null,
      loads: [],
    });

    const repairInfo = bounded(body.repairInfo, 5000);
    const enteredDriverName = bounded(body.driverName, 120);
    const enteredTruckNumber = bounded(body.truckNumber, 60);
    const trailerNumber = bounded(body.trailerNumber, 60);
    // Old and current clients submit these same delivery fields.
    const deliveryTime = bounded(body.deliveryTime, 150);
    const deliveryLocation = bounded(body.deliveryLocation, 500);
    const loadNote = bounded(body.loadNote ?? "", 5000);
    const photos = validateServiceRequestPhotos(body.photos);
    if (!repairInfo || !enteredDriverName || !enteredTruckNumber || trailerNumber === null ||
        typeof body.underLoad !== "boolean" || loadNote === null || photos === null ||
        (body.underLoad && (!deliveryTime || !deliveryLocation))) {
      return json({ error: "Complete the repair and applicable delivery details; use valid photos within the size limits." }, 400);
    }

    const { data: profile } = await admin.from("profiles").select("full_name, email")
      .eq("user_id", user.id).maybeSingle();
    const submittedAt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short",
    }).format(new Date());
    const message = [
      "Service Request",
      `Driver: ${enteredDriverName}`,
      `Truck: ${enteredTruckNumber}`,
      `Trailer: ${trailerNumber || "Not assigned"}`,
      ...(enteredDriverName !== driver.name || enteredTruckNumber !== truck.truck_number
        ? [`TMS assignment at submission: ${driver.name} / truck ${truck.truck_number}`]
        : []),
      `Repair info: ${repairInfo}`,
      `Is driver under a load: ${body.underLoad ? "Yes" : "No"}`,
      ...(body.underLoad ? [
        `Delivery time (TMS local appointment): ${deliveryTime}`,
        `Delivery location: ${deliveryLocation}`,
      ] : []),
      `Note for load/next load: ${loadNote || "None"}`,
      `Submitted by: ${profile?.full_name || user.email || user.id} (${profile?.email || user.email || "no email"})`,
      `Submitted at (Chicago): ${submittedAt}`,
    ].join("\n\n");
    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) throw new Error("Email service is not configured");
    const resend = new Resend(apiKey);
    const { error: emailError, data: emailData } = await resend.emails.send({
      from: "Service Requests <jon@bfprime.net>",
      to: ["djordjeljubicicyt@gmail.com"],
      subject: `Service Request - Truck ${enteredTruckNumber} - ${enteredDriverName}`,
      text: message,
      attachments: photos,
    });
    if (emailError || !emailData?.id) throw new Error("Email provider did not accept the request");
    return json({ success: true });
  } catch (error) {
    console.error("Service request failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not send service request. Please try again." }, 500);
  }
});

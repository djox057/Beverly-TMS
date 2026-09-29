import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@4.0.1";
import { getLoadOption, type Load, type LoadOption } from "./loadStatus.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const uuid = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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

    const [trailerResult, transferResult, orderResult] = await Promise.all([
      truck.trailer_id
        ? admin.from("trailers").select("trailer_number").eq("id", truck.trailer_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      admin.from("order_transfers").select("order_id")
        .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`).limit(100),
      admin.from("orders")
        .select("id, status, canceled, notes, driver1_id, driver2_id, original_driver1_id, original_driver2_id, broker_load_number, delivery_datetime, bol_force_complete, pod_force_complete, pickup_drops(type, sequence_number, checked_out_at, datetime, address, city, state, zip_code), order_files(file_category), order_transfers(driver1_id, driver2_id, sequence_number, transfer_datetime, transfer_address, transfer_city, transfer_state)")
        .in("status", ["pending", "in_transit"])
        .or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id},original_driver1_id.eq.${driver.id},original_driver2_id.eq.${driver.id}`)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (trailerResult.error || transferResult.error || orderResult.error) {
      throw trailerResult.error || transferResult.error || orderResult.error;
    }
    const transferOrderIds = [...new Set((transferResult.data || []).map((t) => t.order_id))];
    let orders = orderResult.data || [];
    const missingIds = transferOrderIds.filter((id) => !orders.some((o) => o.id === id));
    if (missingIds.length) {
      const { data, error } = await admin.from("orders")
        .select("id, status, canceled, notes, driver1_id, driver2_id, original_driver1_id, original_driver2_id, broker_load_number, delivery_datetime, bol_force_complete, pod_force_complete, pickup_drops(type, sequence_number, checked_out_at, datetime, address, city, state, zip_code), order_files(file_category), order_transfers(driver1_id, driver2_id, sequence_number, transfer_datetime, transfer_address, transfer_city, transfer_state)")
        .in("id", missingIds).in("status", ["pending", "in_transit"]);
      if (error) throw error;
      orders = [...orders, ...(data || [])];
    }

    const options: LoadOption[] = orders
      .map((o) => getLoadOption(o as Load, driver.id))
      .filter((o): o is LoadOption => !!o);
    const loaded = options.filter((o) => o.underLoad === true);
    const ambiguous = options.some((o) => o.underLoad === null);
    const suggestion = loaded.length === 1 && !ambiguous ? true :
      loaded.length === 0 && !ambiguous ? false : null;
    const context = {
      driverName: driver.name,
      truckNumber: truck.truck_number,
      trailerNumber: trailerResult.data?.trailer_number || "",
      suggestedUnderLoad: suggestion,
      suggestedOrderId: suggestion === true ? loaded[0].orderId : null,
      // Older published clients still read loadNumber until Lovable republishes the UI.
      loads: options.map((option) => ({ ...option, loadNumber: option.brokerLoadNumber || "Not set" })),
    };
    if (body.action === "preview") return json(context);

    const repairInfo = bounded(body.repairInfo, 5000);
    const enteredDriverName = bounded(body.driverName, 120);
    const enteredTruckNumber = bounded(body.truckNumber, 60);
    const trailerNumber = bounded(body.trailerNumber, 60);
    const deliveryTime = bounded(body.deliveryTime, 150);
    const deliveryLocation = bounded(body.deliveryLocation, 500);
    if (!repairInfo || !enteredDriverName || !enteredTruckNumber || trailerNumber === null || typeof body.underLoad !== "boolean" ||
        (body.underLoad && (!deliveryTime || !deliveryLocation))) {
      return json({ error: "Complete the repair, trailer, load status, and applicable delivery details." }, 400);
    }
    if (body.orderId != null && (!uuid(body.orderId) || !options.some((o) => o.orderId === body.orderId))) {
      return json({ error: "Selected load is no longer assigned to this driver. Reopen the form." }, 409);
    }

    const { data: profile } = await admin.from("profiles").select("full_name, email")
      .eq("user_id", user.id).maybeSingle();
    const submittedAt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short",
    }).format(new Date());
    const selectedLoad = options.find((o) => o.orderId === body.orderId);
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
        `Broker load number: ${selectedLoad ? selectedLoad.brokerLoadNumber || "Not set" : "Not linked to an order"}`,
        `Delivery time (TMS local appointment): ${deliveryTime}`,
        `Delivery location: ${deliveryLocation}`,
      ] : []),
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
    });
    if (emailError || !emailData?.id) throw new Error("Email provider did not accept the request");
    return json({ success: true });
  } catch (error) {
    console.error("Service request failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Could not send service request. Please try again." }, 500);
  }
});

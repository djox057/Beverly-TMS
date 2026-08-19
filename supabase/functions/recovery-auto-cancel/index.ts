import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 100;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const processed: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  try {
    const nowIso = new Date().toISOString();

    const { data: due, error: dueError } = await supabase
      .from("orders")
      .select(
        "id, freight_amount, driver_price, loaded_miles, dh_miles, tonu, tonu_driver, notes, recovery_cancel_payload, recovery_requested_by"
      )
      .eq("retrieval", true)
      .eq("canceled", false)
      .not("recovery_auto_cancel_at", "is", null)
      .lte("recovery_auto_cancel_at", nowIso)
      .limit(BATCH_SIZE);

    if (dueError) throw dueError;

    for (const order of due || []) {
      // Skip orders that were picked up from Recovery Loads in the meantime.
      const { data: fresh } = await supabase
        .from("orders")
        .select("retrieval, canceled, recovery_assigned")
        .eq("id", order.id)
        .maybeSingle();

      if (!fresh || fresh.canceled || fresh.recovery_assigned || !fresh.retrieval) continue;

      const payload = (order.recovery_cancel_payload || {}) as {
        tonu?: number;
        driver_rate?: number;
        dh_miles?: number;
        notes?: string;
      };
      const tonu = Number(payload.tonu ?? 0) || 0;
      const driverRate = Number(payload.driver_rate ?? 0) || 0;
      const dhMiles = Number(payload.dh_miles ?? 0) || 0;
      const notes = payload.notes || "Auto-canceled: recovery deadline expired without assignment.";

      const { error: backupError } = await supabase.from("canceled_orders_backup").insert({
        order_id: order.id,
        canceled_by: order.recovery_requested_by ?? null,
        original_freight_amount: order.freight_amount,
        original_driver_price: order.driver_price,
        original_loaded_miles: order.loaded_miles,
        original_dh_miles: order.dh_miles,
        original_tonu: order.tonu,
        original_tonu_driver: order.tonu_driver,
        original_notes: order.notes,
        cancel_tonu: tonu,
        cancel_driver_rate: driverRate,
        cancel_dh_miles: dhMiles,
        cancel_notes: notes,
      });

      if (backupError) {
        failed.push({ id: order.id, error: backupError.message });
        continue;
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update({
          tonu,
          tonu_driver: driverRate,
          dh_miles: dhMiles,
          notes,
          freight_amount: 0,
          driver_price: 0,
          loaded_miles: 0,
          mileage: dhMiles,
          canceled: true,
          retrieval: false,
          recovery_auto_cancel_at: null,
          recovery_cancel_payload: null,
        })
        .eq("id", order.id)
        .eq("canceled", false);

      if (updateError) {
        failed.push({ id: order.id, error: updateError.message });
        continue;
      }

      processed.push(order.id);
    }

    return new Response(
      JSON.stringify({ success: true, canceled: processed.length, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("recovery-auto-cancel error", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message, canceled: processed.length, failed }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

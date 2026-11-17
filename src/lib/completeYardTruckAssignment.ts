import { supabase } from "@/integrations/supabase/client";

// Complete the existing recovery leg; adding a truck is not another transfer.
export async function completeYardTruckAssignment(orderId: string, driverId: string, truckId: string) {
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("driver1_id, truck_id, is_recovery")
    .eq("id", orderId)
    .single();
  if (orderError) throw orderError;
  if (!order?.is_recovery || order.driver1_id !== driverId || order.truck_id) {
    throw new Error("The assignment has changed. Refresh the yard load and try again.");
  }

  const { data: transfer, error: transferError } = await supabase
    .from("order_transfers")
    .select("id, driver1_id, truck_id")
    .eq("order_id", orderId)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (transferError) throw transferError;
  if (!transfer || transfer.driver1_id !== driverId || (transfer.truck_id && transfer.truck_id !== truckId)) {
    throw new Error("The pending recovery transfer could not be found.");
  }

  const { data: history, error: historyError } = await supabase
    .from("recovery_history")
    .select("id, recovery_truck_id")
    .eq("order_id", orderId)
    .eq("recovery_driver1_id", driverId)
    .is("reverted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (historyError) throw historyError;
  if (!history || (history.recovery_truck_id && history.recovery_truck_id !== truckId)) {
    throw new Error("The pending recovery history could not be found.");
  }

  const { error: updateTransferError } = await supabase
    .from("order_transfers")
    .update({ truck_id: truckId })
    .eq("id", transfer.id)
    .select("id")
    .single();
  if (updateTransferError) throw updateTransferError;

  const { error: updateHistoryError } = await supabase
    .from("recovery_history")
    .update({ recovery_truck_id: truckId })
    .eq("id", history.id)
    .select("id")
    .single();
  if (updateHistoryError) throw updateHistoryError;

  const { data: updatedOrder, error: updateOrderError } = await supabase
    .from("orders")
    .update({ truck_id: truckId })
    .eq("id", orderId)
    .eq("driver1_id", driverId)
    .is("truck_id", null)
    .select("id")
    .single();
  if (updateOrderError) throw updateOrderError;
  if (!updatedOrder) throw new Error("The yard load could not be updated.");
}

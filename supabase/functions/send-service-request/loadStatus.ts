export interface Stop {
  type: string;
  sequence_number?: number | null;
  checked_out_at?: string | null;
  datetime?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
}

export interface Transfer {
  driver1_id?: string | null;
  driver2_id?: string | null;
  sequence_number: number;
  transfer_datetime?: string | null;
  transfer_address?: string | null;
  transfer_city?: string | null;
  transfer_state?: string | null;
}

export interface Load {
  id: string;
  status: string | null;
  canceled: boolean;
  notes: string | null;
  driver1_id: string | null;
  driver2_id: string | null;
  original_driver1_id: string | null;
  original_driver2_id: string | null;
  delivery_datetime: string | null;
  bol_force_complete: boolean;
  pod_force_complete: boolean;
  pickup_drops: Stop[];
  order_files: { file_category: string | null }[];
  order_transfers: Transfer[];
}

export interface LoadOption {
  orderId: string;
  underLoad: boolean | null;
  deliveryTime: string;
  deliveryLocation: string;
}

export function summarizeLoads(options: LoadOption[]) {
  const loaded = options.filter((option) => option.underLoad === true);
  const ambiguous = options.some((option) => option.underLoad === null);
  const suggestedUnderLoad = ambiguous || loaded.length > 1 ? null : loaded.length === 1;
  // Never choose between multiple current/future loads or transfers.
  const candidate = options.length === 1 ? options[0] : loaded.length === 1 && !ambiguous ? loaded[0] : null;
  return {
    suggestedUnderLoad,
    deliveryTime: candidate?.deliveryTime || "",
    deliveryLocation: candidate?.deliveryLocation || "",
  };
}

const location = (stop: { address?: string | null; city?: string | null; state?: string | null; zip_code?: string | null }) =>
  [stop.address, stop.city, stop.state, stop.zip_code].filter(Boolean).join(", ");

/** A booked or overdue appointment does not prove that freight is on the truck. */
export function getLoadOption(order: Load, driverId: string): LoadOption | null {
  if (order.canceled || order.notes === "GAME|OVER" || order.status === "delivered") return null;

  const pickups = (order.pickup_drops || []).filter((s) => s.type === "pickup")
    .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  const deliveries = (order.pickup_drops || []).filter((s) => s.type === "delivery" || s.type === "drop")
    .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  const bolCount = (order.order_files || []).filter((f) => f.file_category === "BOL").length;
  const podCount = (order.order_files || []).filter((f) => f.file_category === "POD").length;
  const pickedUp = pickups.some((s) => !!s.checked_out_at) || bolCount > 0 || !!order.bol_force_complete;
  const delivered = !!order.pod_force_complete ||
    (deliveries.length > 0 && (deliveries.every((s) => !!s.checked_out_at) || podCount >= deliveries.length)) ||
    (deliveries.length === 0 && podCount > 0);
  if (delivered) return null;

  const transfers = [...(order.order_transfers || [])]
    .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
  const ownTransfer = transfers.find((t) => t.driver1_id === driverId || t.driver2_id === driverId);
  const original = order.original_driver1_id === driverId || order.original_driver2_id === driverId ||
    (!ownTransfer && (order.driver1_id === driverId || order.driver2_id === driverId));
  if (!original && !ownTransfer) return null;

  let destination: Pick<Stop, "address" | "city" | "state" | "zip_code" | "datetime"> | undefined =
    deliveries.find((s) => !s.checked_out_at) || deliveries.at(-1);
  let datetime = destination?.datetime || order.delivery_datetime || "";
  if (transfers.length && original) {
    const handoff = transfers.find((t) => t.sequence_number === 0 && (t.driver1_id === driverId || t.driver2_id === driverId)) || transfers[0];
    if (handoff?.transfer_city || handoff?.transfer_state) {
      destination = { address: handoff.transfer_address, city: handoff.transfer_city, state: handoff.transfer_state };
      datetime = handoff.transfer_datetime || "";
    }
  } else if (ownTransfer) {
    const next = transfers.find((t) => t.sequence_number > ownTransfer.sequence_number && (t.transfer_city || t.transfer_state));
    if (next) {
      destination = { address: next.transfer_address, city: next.transfer_city, state: next.transfer_state };
      datetime = next.transfer_datetime || "";
    }
  }

  // A BOL on the original load does not prove a receiving driver took possession.
  // Transfer handoff records contain planned times, not proof of actual handoff.
  const underLoad = ownTransfer && !original ? null : transfers.length ? null : pickedUp;
  return {
    orderId: order.id,
    underLoad,
    deliveryTime: datetime,
    deliveryLocation: destination ? location(destination) : "",
  };
}

interface SortableLoad { id: string; pickupDatetime?: string | null; pStatus: string }
export function compareLoadsByPickupAndAvailability(a: SortableLoad, b: SortableLoad): number {
  // Pickup datetimes are stored as Chicago wall time; compare their calendar dates directly.
  const day = (value?: string | null) => value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "9999-99-99";
  const dateOrder = day(a.pickupDatetime).localeCompare(day(b.pickupDatetime));
  if (dateOrder) return dateOrder;
  const rank = (status: string) => status === "Available" ? 0 : status === "Covered" ? 1 : 2;
  return rank(a.pStatus) - rank(b.pStatus)
    || (a.pickupDatetime || "").localeCompare(b.pickupDatetime || "")
    || a.id.localeCompare(b.id);
}

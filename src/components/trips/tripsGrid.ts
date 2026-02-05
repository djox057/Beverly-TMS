export type TripsGridVariant = "base" | "move" | "paid" | "movePaid";

/**
 * Column widths MUST match the Trips page orange header (TableHead widths).
 * Trips.tsx header widths:
 * - (optional) Move: 32px
 * - Truck#: 80px
 * - Driver: 120px
 * - Load#: 70px
 * - Pickup Date: 110px
 * - Pickup City: 140px
 * - Delivery Date: 115px
 * - Delivery City: 140px
 * - Miles: 70px
 * - Broker Name: 140px
 * - Broker Load#: 110px
 * - Driver Pay: 90px
 * - Freight Amt: 120px
 * - (optional) Paid: 40px
 * - Actions: 80px
 */
export const tripsGridCols: Record<TripsGridVariant, string> = {
  base: "grid-cols-[80px_120px_70px_110px_140px_115px_140px_70px_140px_110px_90px_120px_80px]",
  move: "grid-cols-[32px_80px_120px_70px_110px_140px_115px_140px_70px_140px_110px_90px_120px_80px]",
  paid: "grid-cols-[80px_120px_70px_110px_140px_115px_140px_70px_140px_110px_90px_120px_40px_80px]",
  movePaid: "grid-cols-[32px_80px_120px_70px_110px_140px_115px_140px_70px_140px_110px_90px_120px_40px_80px]",
};

export function getTripsGridVariant(opts: {
  showMoveColumn?: boolean;
  showPaidColumn?: boolean;
}): TripsGridVariant {
  const showMove = Boolean(opts.showMoveColumn);
  const showPaid = Boolean(opts.showPaidColumn);

  if (showMove && showPaid) return "movePaid";
  if (showMove) return "move";
  if (showPaid) return "paid";
  return "base";
}

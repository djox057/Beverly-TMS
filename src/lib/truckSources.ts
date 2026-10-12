// Existing FleetCarrier truck sources, verified against active and inactive trucks.
export const TRUCK_SOURCES = ["BF TRUCK", "M&K", "Ryder", "TEL"] as const;
export type TruckSource = typeof TRUCK_SOURCES[number];

export function normalizeTruckSource(value: string | null | undefined): TruckSource | null {
  const source = value?.trim();
  if (!source) return null;
  if (!TRUCK_SOURCES.some(option => option === source)) {
    throw new Error("Select a truck source: BF TRUCK, M&K, Ryder, or TEL.");
  }
  return source as TruckSource;
}

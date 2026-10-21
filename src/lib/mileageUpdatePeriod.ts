import { fromZonedTime } from "date-fns-tz";

export type MileagePeriodPreset = "first" | "second" | "custom";
export type MileagePeriod = { start: string; end: string };

export function mileagePresetPeriod(month: string, preset: Exclude<MileagePeriodPreset, "custom">): MileagePeriod {
  return { start: `${month}-${preset === "first" ? "01" : "15"}`, end: `${month}-${preset === "first" ? "07" : "22"}` };
}

function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Include the entire end date, including across Chicago DST changes. */
export function mileagePeriodBounds(period: MileagePeriod): { start: string; endExclusive: string } | null {
  if (!validDate(period.start) || !validDate(period.end) || period.start > period.end) return null;
  const next = new Date(`${period.end}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return {
    start: fromZonedTime(`${period.start}T00:00:00`, "America/Chicago").toISOString(),
    endExclusive: fromZonedTime(`${next.toISOString().slice(0, 10)}T00:00:00`, "America/Chicago").toISOString(),
  };
}

export type MileageEdit = { truck_id: string; changed_by: string | null };
export function countMileageUpdates(trucks: readonly { id: string }[], edits: readonly MileageEdit[]) {
  const visible = new Set(trucks.map((truck) => truck.id));
  const updated = new Set<string>();
  const people = new Set<string>();
  for (const edit of edits) {
    if (!visible.has(edit.truck_id)) continue;
    updated.add(edit.truck_id);
    if (edit.changed_by) people.add(edit.changed_by);
  }
  return { updated: updated.size, total: visible.size, remaining: visible.size - updated.size, people: people.size };
}

export type MileageTruckScope = "all" | "assigned";
export type MileageUpdateView = "all" | "updated" | "remaining";

/** Combine the truck scope with the update status for the selected period. */
export function filterMileageUpdateTrucks<T extends { id: string; driver1_id: string | null }>(
  trucks: readonly T[], edits: readonly MileageEdit[], view: MileageUpdateView, scope: MileageTruckScope = "all",
): readonly T[] {
  const scoped = scope === "assigned" ? trucks.filter(truck => !!truck.driver1_id) : trucks;
  if (view === "all") return scoped;
  const updatedIds = new Set(edits.map(edit => edit.truck_id));
  return scoped.filter(truck => view === "updated" ? updatedIds.has(truck.id) : !updatedIds.has(truck.id));
}

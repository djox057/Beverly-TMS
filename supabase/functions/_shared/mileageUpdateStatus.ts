// Mirror of src/lib/mileageUpdateStatus.ts for the Deno runtime.
// Mileage must be refreshed on the 1st and the 15th, with grace until the 5th
// and the 20th. Yellow = missed the current cycle, red = >30 days stale.

export type MileageUpdateStatus = "none" | "yellow" | "red";

const CHICAGO = "America/Chicago";

export const chicagoTodayISO = (now: Date = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: CHICAGO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

const toDays = (iso: string): number => Date.parse(`${iso}T00:00:00Z`) / 86400000;

export const getMileageUpdateStatus = (
  milesUpdatedAt: string | null | undefined,
  now: Date = new Date(),
): MileageUpdateStatus => {
  const today = chicagoTodayISO(now);
  const [ty, tm, td] = today.split("-").map(Number);

  if (!milesUpdatedAt) return "red";
  const updated = String(milesUpdatedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) return "red";

  const daysSince = toDays(today) - toDays(updated);
  if (daysSince > 30) return "red";

  const month = `${ty}-${String(tm).padStart(2, "0")}`;
  const cycleStart = td >= 20 ? `${month}-15` : td >= 5 ? `${month}-01` : null;
  if (cycleStart && toDays(updated) < toDays(cycleStart)) return "yellow";

  return "none";
};

export const daysSinceMileageUpdate = (
  milesUpdatedAt: string | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!milesUpdatedAt) return null;
  const updated = String(milesUpdatedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) return null;
  return Math.round(toDays(chicagoTodayISO(now)) - toDays(updated));
};

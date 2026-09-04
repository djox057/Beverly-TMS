// Mileage ("Total mileage - last update") freshness rules.
//
// Dispatchers must refresh a truck's odometer twice a month: on the 1st and on
// the 15th. They get a grace period until the 5th and the 20th respectively.
// - yellow: the current cycle's deadline passed without an update
// - red:    no update in more than 30 days
// Evaluated in Chicago wall time.

export type MileageUpdateStatus = "none" | "yellow" | "red";

const CHICAGO = "America/Chicago";

/** YYYY-MM-DD for "today" in Chicago. */
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

/** Whole days since the last mileage update (null when never updated). */
export const daysSinceMileageUpdate = (
  milesUpdatedAt: string | null | undefined,
  now: Date = new Date(),
): number | null => {
  if (!milesUpdatedAt) return null;
  const updated = String(milesUpdatedAt).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(updated)) return null;
  return Math.round(toDays(chicagoTodayISO(now)) - toDays(updated));
};

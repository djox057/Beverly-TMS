/**
 * MVR and Clearinghouse dates are stored as the date the check was COMPLETED.
 * They stay valid for one year, and alerts start one month before expiration.
 */

export const ANNUAL_ALERT_LEAD_DAYS = 30;

/** Adds one year to a YYYY-MM-DD string. Returns null for missing/invalid input. */
export const addOneYear = (date: string | null | undefined): string | null => {
  if (!date) return null;
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const next = new Date(Date.UTC(y + 1, m - 1, d));
  return next.toISOString().slice(0, 10);
};

/** Expiration date (completion date + 1 year) for an annual document. */
export const annualDocExpiration = addOneYear;

/** True when the annual document expires within the alert lead time (or already did). */
export const isAnnualDocExpiring = (
  completedDate: string | null | undefined,
  now: Date = new Date(),
  leadDays: number = ANNUAL_ALERT_LEAD_DAYS,
): boolean => {
  const expiration = addOneYear(completedDate);
  if (!expiration) return false;
  const expires = new Date(`${expiration}T00:00:00`);
  return expires.getTime() <= now.getTime() + leadDays * 24 * 60 * 60 * 1000;
};

/** Today as YYYY-MM-DD, used as the default completion date. */
export const todayISODate = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

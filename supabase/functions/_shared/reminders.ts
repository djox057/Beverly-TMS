// Shared helpers for Safety & Maintenance email reminders.

// TEST MODE: while true, every reminder email is delivered only to these
// addresses (with a banner naming the intended recipient). Flip to false to
// deliver to the resolved dispatcher.
export const TEST_MODE = false;
export const TEST_TO = ["tommy@bfprime.net"];
export const TEST_CC = ["jon@bfprime.net"];
export const FROM = "Dispatch <dispatch@bfprime.net>";
export const SAFETY_FALLBACK = ["tommy@bfprime.net"];

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export const MILESTONES = [30, 14, 7, 1];

export const chicagoToday = (): Date => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${parts}T00:00:00Z`);
};

export const chicagoTodayISO = (): string => chicagoToday().toISOString().slice(0, 10);

/** Days until a YYYY-MM-DD (or ISO timestamp) date, in Chicago wall time. */
export const daysUntil = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const target = new Date(`${iso}T00:00:00Z`);
  return Math.round((target.getTime() - chicagoToday().getTime()) / 86400000);
};

/** Returns the milestone this date hits today, or null when it hits none. */
export const milestoneFor = (days: number | null): number | null => {
  if (days === null) return null;
  if (days < 0) return 0; // overdue -> repeats daily
  return MILESTONES.includes(days) ? days : null;
};

export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  if (!y || !m || !d) return String(value);
  return `${m}/${d}/${y}`;
};

export const milestoneLabel = (milestone: number, days: number | null): string => {
  if (milestone <= 0) {
    const overdueBy = days === null ? null : Math.abs(days);
    return overdueBy === null ? "OVERDUE" : `OVERDUE by ${overdueBy} day${overdueBy === 1 ? "" : "s"}`;
  }
  return `${milestone} day${milestone === 1 ? "" : "s"} left`;
};

export const getOilChangeThresholds = (source: string | null | undefined) => {
  const s = (source ?? "").trim().toUpperCase();
  if (s === "M&K" || s === "MK" || s === "M & K") return { yellow: 32000, red: 35000 };
  if (s === "RYDER") return { yellow: 42000, red: 45000 };
  return { yellow: 26000, red: 28000 };
};

export const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export interface Recipients {
  to: string[];
  cc?: string[];
  banner: string | null;
}

/** Applies TEST_MODE routing on top of the intended recipient. */
export const routeRecipients = (intended: string[]): Recipients => {
  const clean = intended.filter(Boolean);
  if (TEST_MODE) {
    return {
      to: TEST_TO,
      cc: TEST_CC,
      banner: `TEST MODE — intended recipient: ${clean.length ? clean.join(", ") : "unresolved (safety fallback)"}`,
    };
  }
  return { to: clean.length ? clean : SAFETY_FALLBACK, cc: undefined, banner: null };
};

export const reminderKey = (
  entityType: string,
  entityId: string | null,
  fieldKey: string,
  milestone: number,
  dueDate: string | null,
  sendDate: string,
): string =>
  milestone <= 0
    ? `${entityType}|${entityId}|${fieldKey}|overdue|${sendDate}`
    : `${entityType}|${entityId}|${fieldKey}|${milestone}|${dueDate ?? "none"}`;
// Phone number + record normalization helpers for RingCentral analytics.
// Pure functions only, so they can be unit tested without network access.

/**
 * Normalize a phone number to E.164 where possible.
 * Returns null when the value cannot be interpreted as a phone number
 * (e.g. extension-only calls, blocked/anonymous callers).
 */
export function toE164(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already E.164
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // US/Canada 10 digit
  if (digits.length === 10) return `+1${digits}`;
  // US/Canada 11 digit starting with 1
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  // International, best effort
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;

  // Too short to be a phone number (extension numbers land here)
  return null;
}

/** Keep the raw provider value for debugging without pretending it is E.164. */
export function rawNumber(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export type CallDirection = "Inbound" | "Outbound";

export function normalizeDirection(raw: unknown): CallDirection | null {
  if (raw === "Inbound" || raw === "Outbound") return raw;
  return null;
}

/** RingCentral `result` strings that count as an answered / connected call. */
const ANSWERED_RESULTS = new Set([
  "Call connected",
  "Accepted",
  "Answered",
  "Call Accepted",
]);

/** RingCentral `result` strings that count as missed / not answered. */
const MISSED_RESULTS = new Set([
  "Missed",
  "No Answer",
  "Rejected",
  "Busy",
  "Hang Up",
  "Abandoned",
  "Declined",
  "Voicemail",
  "Unknown",
  "Blocked",
  "Stopped",
  "Internal Error",
  "IP Phone Offline",
  "Restricted Number",
  "Wrong Number",
  "Suspended Account",
  "Call Failed",
  "Failed to reach the destination",
  "Partial",
  "International Disabled",
]);

export function isAnswered(result: unknown): boolean {
  if (typeof result !== "string") return false;
  if (ANSWERED_RESULTS.has(result)) return true;
  if (MISSED_RESULTS.has(result)) return false;
  // Unknown result strings: treat "connected"-ish text as answered.
  return /connect|accept|answer/i.test(result);
}

/** Chicago-style local date (YYYY-MM-DD) for a UTC instant in a given timezone. */
export function localDate(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d); // en-CA gives YYYY-MM-DD
}

/** Inclusive start-of-day / end-of-day UTC instants for a local date range. */
export function localDayRangeToUtc(
  fromDate: string,
  toDate: string,
  timeZone: string,
): { dateFrom: string; dateTo: string } {
  return {
    dateFrom: localMidnightUtc(fromDate, timeZone).toISOString(),
    dateTo: new Date(
      localMidnightUtc(toDate, timeZone).getTime() + 24 * 60 * 60 * 1000 - 1000,
    ).toISOString(),
  };
}

function localMidnightUtc(date: string, timeZone: string): Date {
  // Guess UTC midnight, then correct by the zone offset at that instant.
  const guess = new Date(`${date}T00:00:00Z`);
  const offsetMinutes = zoneOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60 * 1000);
}

function zoneOffsetMinutes(at: Date, timeZone: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - at.getTime()) / 60000;
}

/** Redact a phone number for logs: keep last 4 digits only. */
export function redactNumber(value: string | null | undefined): string {
  if (!value) return "(none)";
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4 ? "****" : `***${digits.slice(-4)}`;
}
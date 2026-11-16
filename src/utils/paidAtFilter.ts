import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import type { DateRange } from "react-day-picker";

/** Compare calendar days in Central Time, including DST. Unknown timestamps do not match. */
export function matchesPaidAtRange(paidAt: string | null | undefined, range: DateRange | undefined): boolean {
  if (!range?.from) return true;
  if (!paidAt || !Number.isFinite(new Date(paidAt).getTime())) return false;
  const day = formatInTimeZone(new Date(paidAt), "America/Chicago", "yyyy-MM-dd");
  return day >= format(range.from, "yyyy-MM-dd") && day <= format(range.to ?? range.from, "yyyy-MM-dd");
}

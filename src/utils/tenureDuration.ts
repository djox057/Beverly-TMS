/**
 * Human-readable work tenure, e.g. "4 days", "1 week 2 days",
 * "1 month 4 days", "1 month 1 week", "1 year", "1 year 5 days",
 * "1 year 2 weeks", "1 year 2 months".
 */
const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

export function formatWorkTenure(startDate: string | null | undefined): string | null {
  if (!startDate) return null;

  const datePart = String(startDate).split("T")[0].split(" ")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return null;

  const start = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

  const totalDays = Math.floor((today - start) / 86400000);
  if (!isFinite(totalDays) || totalDays < 0) return null;
  if (totalDays < 1) return "1 day";

  const remainderLabel = (days: number): string | null => {
    if (days < 7) return days > 0 ? plural(days, "day") : null;
    if (days < 30) return plural(Math.floor(days / 7), "week");
    return plural(Math.floor(days / 30), "month");
  };

  if (totalDays < 7) return plural(totalDays, "day");

  if (totalDays < 30) {
    const weeks = Math.floor(totalDays / 7);
    const rest = totalDays % 7;
    return rest > 0 ? `${plural(weeks, "week")} ${plural(rest, "day")}` : plural(weeks, "week");
  }

  if (totalDays < 365) {
    const months = Math.floor(totalDays / 30);
    const rest = totalDays - months * 30;
    const label = remainderLabel(rest);
    return label ? `${plural(months, "month")} ${label}` : plural(months, "month");
  }

  const years = Math.floor(totalDays / 365);
  const rest = totalDays - years * 365;
  const label = remainderLabel(rest);
  return label ? `${plural(years, "year")} ${label}` : plural(years, "year");
}
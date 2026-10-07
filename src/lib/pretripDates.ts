import { addDays, format, parseISO, startOfWeek } from "date-fns";

export const chicagoToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

/** Monday of the Chicago calendar week containing the inspection date. */
export const pretripWeekStart = (date: string): string =>
  format(startOfWeek(parseISO(date), { weekStartsOn: 1 }), "yyyy-MM-dd");
export const pretripWeekEnd = (date: string): string =>
  format(addDays(parseISO(pretripWeekStart(date)), 6), "yyyy-MM-dd");
export const pretripDueDate = (): string => pretripWeekStart(chicagoToday());
export const stepPretripDate = (date: string, dir: 1 | -1): string =>
  format(addDays(parseISO(pretripWeekStart(date)), dir * 7), "yyyy-MM-dd");

import { addDays, format, parseISO } from "date-fns";

const chicagoToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());

/** Most recent Monday or Friday (Chicago) on or before today. */
export const pretripDueDate = (): string => {
  let d = parseISO(chicagoToday());
  while (d.getDay() !== 1 && d.getDay() !== 5) d = addDays(d, -1);
  return format(d, "yyyy-MM-dd");
};

/** Step to the previous/next Monday or Friday. */
export const stepPretripDate = (date: string, dir: 1 | -1): string => {
  let d = addDays(parseISO(date), dir);
  while (d.getDay() !== 1 && d.getDay() !== 5) d = addDays(d, dir);
  return format(d, "yyyy-MM-dd");
};

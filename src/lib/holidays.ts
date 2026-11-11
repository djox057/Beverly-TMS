import type { UserRole } from '@/hooks/useAuth';

export const HOLIDAYS_ROLES: UserRole[] = ['admin', 'manager'];
export const MIN_HOLIDAY_YEAR = 2000;
export const MAX_HOLIDAY_YEAR = 2099;

export interface Holiday {
  slug: string;
  name: string;
  date: Date;
  observedDate?: Date;
  motif: string;
  theme: string;
}

export const currentHolidayYear = () => Number(new Intl.DateTimeFormat('en-US', {
  year: 'numeric', timeZone: 'America/Chicago',
}).format(new Date()));

export const parseHolidayYear = (value: string | undefined): number | null => {
  if (!value || !/^\d{4}$/.test(value)) return null;
  const year = Number(value);
  return year >= MIN_HOLIDAY_YEAR && year <= MAX_HOLIDAY_YEAR ? year : null;
};

const nthWeekday = (year: number, month: number, weekday: number, nth: number) => {
  const first = new Date(year, month, 1);
  return new Date(year, month, 1 + (weekday - first.getDay() + 7) % 7 + (nth - 1) * 7);
};
const lastMonday = (year: number, month: number) => {
  const last = new Date(year, month + 1, 0);
  return new Date(year, month, last.getDate() - (last.getDay() + 6) % 7);
};

const shift = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const observed = (date: Date) => date.getDay() === 6 ? shift(date, -1) : date.getDay() === 0 ? shift(date, 1) : undefined;

// Company holiday list. Slugs remain stable so existing notes stay attached.
export function getHolidays(year: number): Holiday[] {
  const fixed = (month: number, day: number) => new Date(year, month - 1, day);
  const holiday = (slug: string, name: string, date: Date, motif: string, theme: string): Holiday => ({
    slug, name, date, motif, theme, observedDate: observed(date),
  });
  return [
    holiday('new-years-day', 'New Year', fixed(1, 1), '✦', 'winter'),
    holiday('memorial-day', 'Memorial Day', lastMonday(year, 4), '🇺🇸', 'patriotic'),
    holiday('independence-day', '4th of July', fixed(7, 4), '🎆', 'patriotic'),
    holiday('labor-day', 'Labor Day', nthWeekday(year, 8, 1, 1), '⚙️', 'sunshine'),
    holiday('thanksgiving', 'Thanksgiving', nthWeekday(year, 10, 4, 4), '🦃', 'harvest'),
    holiday('christmas', 'Christmas', fixed(12, 25), '🎄', 'christmas'),
  ];
}

import type { UserRole } from '@/hooks/useAuth';

export const HOLIDAYS_ROLES: UserRole[] = ['admin', 'manager'];
export const MIN_HOLIDAY_YEAR = 2000;
export const MAX_HOLIDAY_YEAR = 2099;

export interface Holiday {
  slug: string;
  name: string;
  date: Date;
  observedDate?: Date;
  federal: boolean;
  motif: string;
  theme: string;
  detail: string;
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

// Gregorian computus. Dates are local calendar dates, never parsed as UTC strings.
const easterSunday = (year: number) => {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const n = h + l - 7 * m + 114;
  return new Date(year, Math.floor(n / 31) - 1, n % 31 + 1);
};
const shift = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const observed = (date: Date) => date.getDay() === 6 ? shift(date, -1) : date.getDay() === 0 ? shift(date, 1) : undefined;

// Federal rules: https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
// Common occasions are explicitly distinguished from federal holidays in the UI.
export function getHolidays(year: number): Holiday[] {
  const fixed = (month: number, day: number) => new Date(year, month - 1, day);
  const easter = easterSunday(year);
  const thanksgiving = nthWeekday(year, 10, 4, 4);
  const holiday = (slug: string, name: string, date: Date, federal: boolean, motif: string, theme: string, detail: string): Holiday => ({
    slug, name, date, federal, motif, theme, detail,
    observedDate: federal ? observed(date) : undefined,
  });
  return [
    holiday('new-years-day', "New Year's Day", fixed(1, 1), true, '✦', 'winter', 'A fresh start. A clear road ahead.'),
    holiday('martin-luther-king-jr-day', 'Martin Luther King Jr. Day', nthWeekday(year, 0, 1, 3), true, '🕊️', 'civic', 'A day of service, unity, and reflection.'),
    holiday('valentines-day', "Valentine's Day", fixed(2, 14), false, '♡', 'love', 'A little heart for every mile.'),
    holiday('presidents-day', "Presidents' Day", nthWeekday(year, 1, 1, 3), true, '★', 'patriotic', "Washington's Birthday • Honoring a legacy of leadership."),
    holiday('st-patricks-day', "St. Patrick's Day", fixed(3, 17), false, '☘️', 'spring', 'A little luck along the way.'),
    holiday('good-friday', 'Good Friday', shift(easter, -2), false, '🕊️', 'spring', 'A quiet moment for reflection.'),
    holiday('easter', 'Easter Sunday', easter, false, '🥚', 'spring', 'New beginnings, brighter days.'),
    holiday('mothers-day', "Mother's Day", nthWeekday(year, 4, 0, 2), false, '🌷', 'love', 'Celebrating the people who feel like home.'),
    holiday('memorial-day', 'Memorial Day', lastMonday(year, 4), true, '🇺🇸', 'patriotic', 'Remembering those who gave everything.'),
    ...(year >= 2021 ? [holiday('juneteenth', 'Juneteenth', fixed(6, 19), true, '☀️', 'sunshine', 'Freedom, community, and a brighter future.')] : []),
    holiday('fathers-day', "Father's Day", nthWeekday(year, 5, 0, 3), false, '🧭', 'civic', 'For the ones who help us find our way.'),
    holiday('independence-day', 'Independence Day', fixed(7, 4), true, '🎆', 'patriotic', 'Stars, stripes, and summer skies.'),
    holiday('labor-day', 'Labor Day', nthWeekday(year, 8, 1, 1), true, '⚙️', 'sunshine', 'Celebrating the people who keep things moving.'),
    holiday('columbus-day', 'Columbus Day', nthWeekday(year, 9, 1, 2), true, '🍂', 'harvest', "Also recognized as Indigenous Peoples' Day in many communities."),
    holiday('halloween', 'Halloween', fixed(10, 31), false, '🎃', 'halloween', 'A few treats. A few tricks. Plenty of pumpkins.'),
    holiday('veterans-day', 'Veterans Day', fixed(11, 11), true, '🎖️', 'patriotic', 'With gratitude to all who have served.'),
    holiday('thanksgiving', 'Thanksgiving', thanksgiving, true, '🦃', 'harvest', 'Room at the table. Gratitude for the journey.'),
    holiday('black-friday', 'Black Friday', shift(thanksgiving, 1), false, '🛍️', 'harvest', 'The holiday rush begins.'),
    holiday('christmas-eve', 'Christmas Eve', fixed(12, 24), false, '🎁', 'christmas', 'A little anticipation. A little holiday magic.'),
    holiday('christmas', 'Christmas Day', fixed(12, 25), true, '🎄', 'christmas', 'Warm wishes, twinkling lights, and the road home.'),
    holiday('new-years-eve', "New Year's Eve", fixed(12, 31), false, '✨', 'winter', 'One last page before a new chapter.'),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
}

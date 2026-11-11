import { describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';
import { currentHolidayYear, getHolidays, parseHolidayYear } from './holidays';

describe('US holiday dates', () => {
  it('shows only the six company holidays, using their actual calendar dates', () => {
    expect(getHolidays(2026).map(holiday => [holiday.slug, format(holiday.date, 'yyyy-MM-dd')])).toEqual([
      ['new-years-day', '2026-01-01'], ['memorial-day', '2026-05-25'],
      ['independence-day', '2026-07-04'], ['labor-day', '2026-09-07'],
      ['thanksgiving', '2026-11-26'], ['christmas', '2026-12-25'],
    ]);
    expect(getHolidays(2026).find(holiday => holiday.slug === 'independence-day')!.observedDate).toEqual(new Date(2026, 6, 3));
  });
  it('recalculates moving holidays and keeps actual dates separate from observances', () => {
    const lookup = (year: number, slug: string) => getHolidays(year).find(holiday => holiday.slug === slug)!;
    expect(format(lookup(2027, 'memorial-day').date, 'yyyy-MM-dd')).toBe('2027-05-31');
    expect(format(lookup(2027, 'labor-day').date, 'yyyy-MM-dd')).toBe('2027-09-06');
    expect(format(lookup(2027, 'thanksgiving').date, 'yyyy-MM-dd')).toBe('2027-11-25');
    expect(format(lookup(2027, 'christmas').date, 'yyyy-MM-dd')).toBe('2027-12-25');
    expect(format(lookup(2027, 'christmas').observedDate!, 'yyyy-MM-dd')).toBe('2027-12-24');
    expect(format(lookup(2028, 'new-years-day').observedDate!, 'yyyy-MM-dd')).toBe('2027-12-31');
  });
  it('uses Chicago year at the year boundary', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2027-01-01T01:00:00Z'));
      expect(currentHolidayYear()).toBe(2026);
      vi.setSystemTime(new Date('2027-01-01T06:00:00Z'));
      expect(currentHolidayYear()).toBe(2027);
    } finally { vi.useRealTimers(); }
  });
  it('rejects malformed and unsupported years', () => {
    for (const value of ['banana', '2026junk', '1999', '2100', '', undefined]) expect(parseHolidayYear(value)).toBeNull();
    expect(parseHolidayYear('2026')).toBe(2026);
  });
});

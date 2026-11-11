import { describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';
import { currentHolidayYear, getHolidays, parseHolidayYear } from './holidays';

describe('US holiday dates', () => {
  it('matches the 2026 OPM federal schedule, including July 3 observance', () => {
    expect(getHolidays(2026).filter(holiday => holiday.federal).map(holiday => [holiday.slug, format(holiday.observedDate ?? holiday.date, 'yyyy-MM-dd')])).toEqual([
      ['new-years-day', '2026-01-01'], ['martin-luther-king-jr-day', '2026-01-19'],
      ['presidents-day', '2026-02-16'], ['memorial-day', '2026-05-25'],
      ['juneteenth', '2026-06-19'], ['independence-day', '2026-07-03'],
      ['labor-day', '2026-09-07'], ['columbus-day', '2026-10-12'],
      ['veterans-day', '2026-11-11'], ['thanksgiving', '2026-11-26'], ['christmas', '2026-12-25'],
    ]);
  });
  it('recalculates moving holidays and keeps actual dates separate from observances', () => {
    const lookup = (year: number, slug: string) => getHolidays(year).find(holiday => holiday.slug === slug)!;
    expect(format(lookup(2026, 'easter').date, 'yyyy-MM-dd')).toBe('2026-04-05');
    expect(format(lookup(2026, 'good-friday').date, 'yyyy-MM-dd')).toBe('2026-04-03');
    expect(format(lookup(2027, 'easter').date, 'yyyy-MM-dd')).toBe('2027-03-28');
    expect(format(lookup(2027, 'thanksgiving').date, 'yyyy-MM-dd')).toBe('2027-11-25');
    expect(format(lookup(2027, 'christmas').date, 'yyyy-MM-dd')).toBe('2027-12-25');
    expect(format(lookup(2027, 'christmas').observedDate!, 'yyyy-MM-dd')).toBe('2027-12-24');
    expect(format(lookup(2028, 'new-years-day').observedDate!, 'yyyy-MM-dd')).toBe('2027-12-31');
    expect(getHolidays(2020).some(holiday => holiday.slug === 'juneteenth')).toBe(false);
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

import { describe, expect, it } from 'vitest';
import { getAfterhoursShiftTime } from './afterhoursShiftTime';

describe('Serbia afterhours shift boundaries', () => {
  it.each([
    ['2026-10-13T03:59:59Z', 'night', '2026-10-12'],
    ['2026-10-13T04:00:00Z', 'morning', '2026-10-13'],
    ['2026-10-13T06:18:00Z', 'morning', '2026-10-13'],
    ['2026-10-13T11:59:59Z', 'morning', '2026-10-13'],
    ['2026-10-13T12:00:00Z', null, '2026-10-13'],
    ['2026-10-13T19:59:59Z', null, '2026-10-13'],
    ['2026-10-13T20:00:00Z', 'night', '2026-10-13'],
    ['2026-10-13T22:00:00Z', 'night', '2026-10-13'],
    ['2026-12-01T05:00:00Z', 'morning', '2026-12-01'],
    ['2026-10-25T04:59:59Z', 'night', '2026-10-24'],
    ['2026-10-25T05:00:00Z', 'morning', '2026-10-25'],
    ['2026-01-01T00:00:00Z', 'night', '2025-12-31'],
  ])('selects %s independently of Chicago and browser time', (iso, shift, scheduledDate) => {
    expect(getAfterhoursShiftTime(new Date(iso))).toMatchObject({ shift, scheduledDate });
  });
});

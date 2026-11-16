import { describe, it, expect } from 'vitest';
import { matchesPaidAtRange } from './paidAtFilter';
describe('Central Time paid dates', () => {
  it('uses CT midnight in winter and summer', () => {
    for (const [day, before, midnight] of [
      [new Date(2026, 0, 15), '2026-01-15T05:59:59Z', '2026-01-15T06:00:00Z'],
      [new Date(2026, 6, 15), '2026-07-15T04:59:59Z', '2026-07-15T05:00:00Z'],
    ] as const) {
      expect(matchesPaidAtRange(before, {from:day})).toBe(false);
      expect(matchesPaidAtRange(midnight, {from:day})).toBe(true);
    }
  });
  it('handles the DST fallback day, unknown dates, and inclusive ranges', () => {
    const range = {from:new Date(2026,10,1),to:new Date(2026,10,2)};
    expect(matchesPaidAtRange('2026-11-01T06:30:00Z', range)).toBe(true);
    expect(matchesPaidAtRange('2026-11-01T07:30:00Z', range)).toBe(true);
    expect(matchesPaidAtRange('2026-11-03T05:59:59Z', range)).toBe(true);
    expect(matchesPaidAtRange('2026-11-03T06:00:00Z', range)).toBe(false);
    expect(matchesPaidAtRange(null, range)).toBe(false);
    expect(matchesPaidAtRange(null, undefined)).toBe(true);
  });
});

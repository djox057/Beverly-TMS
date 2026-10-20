import { expect, it } from 'vitest';
import { formatHosStopWindow } from '../../supabase/functions/hos-load-check/format-stop-window';

it('formats same-day windows exactly as requested', () => {
  expect(formatHosStopWindow('2026-10-20T06:30:00+00:00', '2026-10-20T14:00:00+00:00')).toBe('10/20/2026 06:30-14:00');
});
it('retains both dates for an overnight window', () => {
  expect(formatHosStopWindow('2026-10-20T23:30:00+00:00', '2026-10-21T02:00:00+00:00')).toBe('10/20/2026 23:30-10/21/2026 02:00');
});
it('shows a single appointment once when the end is absent or identical', () => {
  expect(formatHosStopWindow('2026-10-20T06:30:00Z')).toBe('10/20/2026 06:30');
  expect(formatHosStopWindow('2026-10-20T06:30:00Z', '2026-10-20T06:30:00Z')).toBe('10/20/2026 06:30');
});
it('preserves the stored local time regardless of the serialized offset', () => {
  expect(formatHosStopWindow('2026-10-20T06:30:00-05:00', '2026-10-20T14:00:00-05:00')).toBe('10/20/2026 06:30-14:00');
});
it('handles missing or malformed appointment values', () => {
  expect(formatHosStopWindow(null, null)).toBe('Not set');
  expect(formatHosStopWindow('bad')).toBe('Not set');
  expect(formatHosStopWindow(null, '2026-10-20T14:00:00Z')).toBe('10/20/2026 14:00');
});

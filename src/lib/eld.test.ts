import { describe, expect, it } from 'vitest';
import { eldComplete, eldToday, filterEldChecks, isEldWeekday, type EldCheck } from './eld';

const row = (overrides: Partial<EldCheck> = {}): EldCheck => ({
  id: 'check', driver_id: 'driver', work_date: '2026-10-21', driver_name: 'Driver One', truck_number: '460',
  worker_id: 'worker-one', worker_name: 'ELD One', yesterday_log: false, forms: false, pti: false,
  comment: '', updated_by: null, updated_at: '2026-10-21T12:00:00Z', ...overrides,
});
describe('ELD daily work', () => {
  it('uses Chicago midnight in summer and winter, including DST boundaries', () => {
    expect(eldToday(new Date('2026-10-21T04:59:59Z'))).toBe('2026-10-20');
    expect(eldToday(new Date('2026-10-21T05:00:00Z'))).toBe('2026-10-21');
    expect(eldToday(new Date('2026-12-01T05:59:59Z'))).toBe('2026-11-30');
    expect(eldToday(new Date('2026-12-01T06:00:00Z'))).toBe('2026-12-01');
    expect(eldToday(new Date('2026-11-01T06:30:00Z'))).toBe('2026-11-01');
    expect(eldToday(new Date('2026-11-01T07:30:00Z'))).toBe('2026-11-01');
  });
  it('requires work Monday through Friday only', () => {
    expect(isEldWeekday('2026-10-23')).toBe(true);
    expect(isEldWeekday('2026-10-24')).toBe(false);
    expect(isEldWeekday('2026-10-25')).toBe(false);
    expect(isEldWeekday('2026-10-26')).toBe(true);
  });
  it('requires all three checks for completion', () => {
    expect(eldComplete(row({ yesterday_log: true, forms: true }))).toBe(false);
    expect(eldComplete(row({ yesterday_log: true, forms: true, pti: true }))).toBe(true);
  });
  it('combines search, worker and completion filters, including unassigned drivers', () => {
    const rows = [row(), row({ id: 'unassigned', worker_id: null, worker_name: null }), row({ id: 'done', driver_name: 'Driver Two', worker_id: 'worker-two', yesterday_log: true, forms: true, pti: true })];
    expect(filterEldChecks(rows, '460', 'unassigned', 'incomplete').map(r => r.id)).toEqual(['unassigned']);
    expect(filterEldChecks(rows, 'driver TWO', 'worker-two', 'complete').map(r => r.id)).toEqual(['done']);
    expect(filterEldChecks(rows, 'ELD One', 'worker-one', 'incomplete').map(r => r.id)).toEqual(['check']);
    expect(filterEldChecks(rows, '', 'all', 'complete').map(r => r.id)).toEqual(['done']);
  });
});

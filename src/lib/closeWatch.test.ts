import { describe, expect, it } from 'vitest';
import { closeWatchGroups, isCloseWatchUrgent } from './closeWatch';

describe('Close Watch', () => {
  it('pins urgent drivers across offices and preserves dispatcher identities', () => {
    const groups = [
      { dispatcherId: 'a', office: 'Čačak', trucks: [{ id: 'normal', closeWatch: true, driveMinutes: 60 }, { id: 'other', closeWatch: false, driveMinutes: 0 }] },
      { dispatcherId: 'b', office: 'BG', trucks: [{ id: 'low', closeWatch: true, driveMinutes: 59 }, { id: 'unknown', closeWatch: true, driveMinutes: null }] },
    ];
    const result = closeWatchGroups(groups);
    expect(result.flatMap(g => g.trucks.map(t => t.id))).toEqual(['low', 'normal', 'unknown']);
    expect(result.map(g => g.dispatcherId)).toEqual(['b', 'a', 'b']);
    expect(groups[0].trucks).toHaveLength(2);
  });
  it('uses a strict 60-minute threshold and does not mark missing HOS red', () => {
    for (const driveMinutes of [0, 59, -1]) expect(isCloseWatchUrgent({ driveMinutes })).toBe(true);
    for (const driveMinutes of [60, 61, null, undefined, NaN]) expect(isCloseWatchUrgent({ driveMinutes })).toBe(false);
  });
});

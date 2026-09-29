import { describe, expect, it } from 'vitest';
import {
  allocateAfterhoursDrivers,
  countDriverUnits,
  expandAllocatedDriverIds,
  groupTeamDriverRows,
  mergeTeamDrivers,
  type AllocDriver,
} from './afterhoursAutoAssign';

const truck = { id: 'truck-1', driver1_id: 'first', driver2_id: 'second' };
const first = { id: 'first', dispatcher_id: 'dispatch-a', office: 'a', company_id: 'company-a', truck };
const second = { id: 'second', dispatcher_id: 'dispatch-b', office: 'b', company_id: 'company-b', truck };
const solo = { id: 'solo', dispatcher_id: null, office: 'a', company_id: null, truck: null };

describe('afterhours team units', () => {
  it('keeps an active team together and writes both driver records for each day or shift', () => {
    const units = mergeTeamDrivers([second, solo, first]);
    expect(units).toHaveLength(2);
    expect(units.find((unit) => unit.id === 'first')).toMatchObject({
      dispatcher_id: 'dispatch-a', office: 'a', company_id: 'company-a',
      memberIds: ['first', 'second'],
    });

    const users = [
      { id: 'dispatch-a', office: 'a' },
      { id: 'dispatch-b', office: 'b' },
    ];
    for (const bucketByOffice of [true, false]) {
      const allocated = allocateAfterhoursDrivers(users, units, { bucketByOffice });
      const expanded = expandAllocatedDriverIds(allocated, new Map(units.map((unit) => [unit.id, unit])));
      expect(expanded.get('dispatch-a')).toEqual(expect.arrayContaining(['first', 'second']));
      expect([...expanded.values()].flat().sort()).toEqual(['first', 'second', 'solo']);
      expect(countDriverUnits(expanded.get('dispatch-a')!.map((id) => ({ id, truck: id === 'solo' ? null : truck })))).toBe(
        expanded.get('dispatch-a')!.includes('solo') ? 2 : 1,
      );
    }
  });

  it('leaves an incomplete or mismatched team as individual drivers', () => {
    expect(mergeTeamDrivers([first, solo]).map((unit) => unit.id)).toEqual(['first', 'solo']);
    const mismatched = { ...second, truck: { ...truck, id: 'truck-2' } };
    expect(mergeTeamDrivers([first, mismatched]).every((unit: AllocDriver) => !unit.memberIds)).toBe(true);
    expect(countDriverUnits([{ id: 'first', truck }, { id: 'second', truck }, { id: 'solo' }])).toBe(2);
  });

  it('renders truck 460 once as TEAM and keeps both ids for manual assignment and removal', () => {
    const rows = groupTeamDriverRows([
      { ...second, name: 'Maria Arteaga', truck: { ...truck, truck_number: '460' } },
      { ...first, name: 'Mark Arteaga', truck: { ...truck, truck_number: '460' } },
      { ...solo, name: 'Solo Driver' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'first', name: 'TEAM',
      memberNames: ['Mark Arteaga', 'Maria Arteaga'],
      memberIds: ['first', 'second'],
      truck: { truck_number: '460' },
    });
    expect(rows[1]).toMatchObject({ name: 'Solo Driver', memberIds: ['solo'] });
    // A split historical assignment must not claim that both members are here.
    expect(groupTeamDriverRows([{ ...first, name: 'Mark Arteaga' }])[0].name).toBe('Mark Arteaga');
  });
});

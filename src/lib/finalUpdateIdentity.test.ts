import { describe, expect, it } from 'vitest';
import { finalUpdateIdentity, finalUpdateRowId } from './finalUpdateIdentity';
describe('final update report identities', () => {
  it('stores recovery driver rows without sending synthetic IDs as truck UUIDs', () => {
    const id = '40bddddd-a656-48cb-9b8d-b745dcfc34ee';
    expect(finalUpdateIdentity(`driver-${id}`)).toEqual({ truck_id: null, driver_id: id });
    expect(finalUpdateRowId(finalUpdateIdentity(`driver-${id}`))).toBe(`driver-${id}`);
  });
  it('keeps real trucks keyed by truck across refreshes', () => {
    expect(finalUpdateIdentity('truck-uuid', 'driver-uuid')).toEqual({ truck_id: 'truck-uuid', driver_id: 'driver-uuid' });
    expect(finalUpdateRowId({ truck_id: 'truck-uuid', driver_id: 'driver-uuid' })).toBe('truck-uuid');
  });
  it('does not create a display key for an empty record', () => {
    expect(finalUpdateRowId({ truck_id: null, driver_id: null })).toBeNull();
  });
});

import {it,expect} from 'vitest';
import {previousDelivery} from './previousDelivery';
it('does not use a later prebook or an unfinished multi-drop load as the deadhead origin',()=>{
  const orders=[{id:'later',delivery_datetime:'2026-10-22T10:00:00Z'},
    {id:'multi',delivery_datetime:'2026-10-19T09:00:00Z',delivery_end_datetime:'2026-10-20T20:00:00Z'},
    {id:'correct',delivery_datetime:'2026-10-19T08:00:00Z',delivery_end_datetime:'2026-10-19T10:00:00Z'}];
  expect(previousDelivery(orders,'2026-10-20T08:00:00Z')?.id).toBe('correct');
});

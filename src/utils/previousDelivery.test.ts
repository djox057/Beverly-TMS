import {it,expect} from 'vitest';
import {previousDelivery} from './previousDelivery';
it('does not use a later prebook or an unfinished multi-drop load as the deadhead origin',()=>{
  const orders=[{id:'later',delivery_datetime:'2026-10-22T10:00:00Z'},
    {id:'multi',delivery_datetime:'2026-10-19T09:00:00Z',delivery_end_datetime:'2026-10-20T20:00:00Z',pickup_drops:[{type:'delivery',sequence_number:3,datetime:'2026-10-20T20:00:00Z'}]},
    {id:'correct',delivery_datetime:'2026-10-19T08:00:00Z',delivery_end_datetime:'2026-10-19T10:00:00Z'}];
  expect(previousDelivery(orders,'2026-10-20T08:00:00Z')?.id).toBe('correct');
});
it('does not skip the latest delivery just because its FCFS window closes after pickup',()=>{
  const orders=[{id:'latest',delivery_datetime:'2026-10-20T08:00:00Z',delivery_end_datetime:'2026-10-20T23:59:00Z'},
    {id:'older',delivery_datetime:'2026-10-19T10:00:00Z',delivery_end_datetime:'2026-10-19T12:00:00Z'}];
  expect(previousDelivery(orders,'2026-10-20T12:00:00Z')?.id).toBe('latest');
});
it('sorts multi-drop loads by final delivery, rather than first drop or window end',()=>{
  const orders=[{id:'multi',delivery_datetime:'2026-10-19T08:00:00Z',pickup_drops:[{type:'delivery',sequence_number:3,datetime:'2026-10-20T09:00:00Z'}]},
    {id:'older',delivery_datetime:'2026-10-20T08:00:00Z',delivery_end_datetime:'2026-10-20T18:00:00Z'}];
  expect(previousDelivery(orders,'2026-10-20T12:00:00Z')?.id).toBe('multi');
});

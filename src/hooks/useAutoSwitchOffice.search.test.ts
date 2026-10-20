import { expect, it, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({supabase:{}}));
import { lookupReportOffices } from './useAutoSwitchOffice';

it('looks up each dispatcher separately and combines their offices', async () => {
  const lookup = vi.fn(async (term:string) => ({type:'found' as const, office:term==='rick'?'Chicago':'Čačak'}));
  expect(await lookupReportOffices(' Nate, wayne, RICK, nate, ',lookup)).toEqual({type:'ambiguous',offices:['Čačak','Chicago']});
  expect(lookup.mock.calls.map(call=>call[0])).toEqual(['nate','wayne','rick']);
});
it('keeps a matched unit office when another unit has no match', async () => {
  const lookup = vi.fn(async (term:string) => term==='460'?{type:'found' as const,office:'Čačak'}:{type:'not_found' as const});
  expect(await lookupReportOffices('460,999',lookup)).toEqual({type:'found',office:'Čačak'});
});
it('retains ambiguous office choices and does not query empty terms', async () => {
  const lookup = vi.fn(async () => ({type:'ambiguous' as const,offices:['BG','Chicago']}));
  expect(await lookupReportOffices('460,',lookup)).toEqual({type:'ambiguous',offices:['BG','Chicago']});
  lookup.mockClear();
  expect(await lookupReportOffices(' , , ',lookup)).toEqual({type:'not_found'});
  expect(lookup).not.toHaveBeenCalled();
});

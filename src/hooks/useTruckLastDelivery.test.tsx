import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { useTruckLastDelivery } from './useTruckLastDelivery';
const mock = vi.hoisted(() => ({ from: vi.fn(), filter: vi.fn(), orders: [] as any[] }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  mock.from(table);
  const chain: any = {select:()=>chain,or:()=>chain,eq:()=>chain,not:()=>chain,lte:(...args:unknown[])=>{mock.filter(...args);return chain;},order:()=>chain,limit:()=>chain,
    then: (resolve: any) => Promise.resolve({data:mock.orders,error:null}).then(resolve)};
  return chain;
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const stop = (datetime: string, address: string, sequence_number = 2) => ({type:'delivery',datetime,address,city:null,state:null,zip_code:null,sequence_number});
function lookup() {
  const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
  return renderHook(() => useTruckLastDelivery('driver', '2026-10-20T12:00:00Z'), {
    wrapper: ({children}) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
it('returns the latest delivery address despite a later FCFS closing time', async () => {
  mock.orders = [
    {id:'latest',delivery_datetime:'2026-10-20T08:00:00Z',delivery_end_datetime:'2026-10-20T23:59:00Z',pickup_drops:[stop('2026-10-20T08:00:00Z','Latest destination')]},
    {id:'older',delivery_datetime:'2026-10-19T10:00:00Z',pickup_drops:[stop('2026-10-19T10:00:00Z','Older destination')]},
  ];
  const {result} = lookup();
  await waitFor(() => expect(result.current.data?.deliveryAddress).toBe('Latest destination'));
  expect(mock.from.mock.calls).toEqual([['orders']]);
});
it('uses the actual final drop to rank multi-stop loads and return the origin', async () => {
  mock.orders = [
    {id:'older',delivery_datetime:'2026-10-20T08:00:00Z',pickup_drops:[stop('2026-10-20T08:00:00Z','Other destination')]},
    {id:'multi',delivery_datetime:'2026-10-19T08:00:00Z',pickup_drops:[stop('2026-10-20T09:00:00Z','Final destination',3),stop('2026-10-19T08:00:00Z','First drop')]},
  ];
  const {result} = lookup();
  await waitFor(() => expect(result.current.data).toEqual({orderId:'multi',deliveryAddress:'Final destination',deliveryDatetime:'2026-10-20T09:00:00Z'}));
});
it('uses the latest unfinished load even when its delivery is after the new pickup', async () => {
  mock.orders=[
    {id:'rome',pickup_datetime:'2026-10-19T12:00:00Z',delivery_datetime:'2026-10-20T06:30:00Z',pickup_drops:[stop('2026-10-20T06:30:00Z','Rome, GA')]},
    {id:'lufkin',pickup_datetime:'2026-10-19T18:00:00Z',delivery_datetime:'2026-10-21T14:00:00Z',pod:false,pickup_drops:[stop('2026-10-21T14:00:00Z','Lufkin, TX')]},
    {id:'future',pickup_datetime:'2026-10-22T08:00:00Z',delivery_datetime:'2026-10-23T08:00:00Z',pickup_drops:[stop('2026-10-23T08:00:00Z','Future destination')]},
  ];
  const {result}=lookup();
  await waitFor(()=>expect(result.current.data?.deliveryAddress).toBe('Lufkin, TX'));
  expect(mock.filter).toHaveBeenCalledWith('pickup_datetime','2026-10-20T12:00:00Z');
  expect(mock.filter).not.toHaveBeenCalledWith('delivery_datetime',expect.anything());
});

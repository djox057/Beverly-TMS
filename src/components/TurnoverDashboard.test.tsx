import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach,describe,it,expect,vi } from 'vitest';
import { TurnoverDashboard } from './TurnoverDashboard';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),legacy:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:(...args:unknown[])=>mocks.rpc(...args)}}));
vi.mock('@/contexts/AuthContext',()=>({useAuthContext:()=>({user:{id:'admin'}})}));
vi.mock('@/lib/mileageUpdateStatus',()=>({chicagoTodayISO:()=> '2026-11-09'}));
vi.mock('recharts',()=>({ResponsiveContainer:({children}:any)=><div>{children}</div>,LineChart:()=> <div data-testid="monthly-chart"/>,Line:()=>null,CartesianGrid:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null}));
vi.mock('@/components/ui/date-range-picker',()=>({DateRangePicker:()=> <div>Custom dates</div>}));
beforeEach(()=>{
 mocks.legacy.mockReset();mocks.rpc.mockReset();
 mocks.rpc.mockImplementation(async(name:string,args:any)=>{
  if(name==='get_turnover_events')return{data:{total:51,items:[{id:'e',driver_id:'driver',driver_name:'Demo Driver',driver_exists:true,dispatcher_name:'Alpha',office:'Čačak',occurred_on:'2026-11-05',counts_as_turnover:true,reason:'Departure reason',source:'captured'}]},error:null};
  if(args.p_end<'2026-04-01')return{data:{available:false},error:null};
  return{data:{available:true,start:args.p_start,end:args.p_end,historical_from:'2026-04-01',tracking_started:'2026-11-09T16:00:00Z',missing_dates:[],months:[{month_start:'2026-11-01',expected_days:9,observed_days:9,legacy_days:8,partial_today:true}],dispatchers:[{dispatcher_id:'a',dispatcher_name:'Alpha',office:'Čačak'},{dispatcher_id:'b',dispatcher_name:'Beta',office:'Beograd'},{dispatcher_id:'c',dispatcher_name:'Zero',office:'Čačak'}],groups:[{month_start:'2026-11-01',dispatcher_id:'a',dispatcher_name:'Alpha',office:'Čačak',driver_days:900,departures:10,excluded:2,reactivations:0,estimated:true},{month_start:'2026-11-01',dispatcher_id:'b',dispatcher_name:'Beta',office:'Beograd',driver_days:1800,departures:6,excluded:0,reactivations:0,estimated:true}]},error:null};
 });
});
const mount=()=>render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><TurnoverDashboard onLegacy={mocks.legacy}/></QueryClientProvider></MemoryRouter>);
describe('Turnover overview',()=>{
 it('shows rates and global shares, then opens the office dispatcher overview',async()=>{mount();await screen.findByText('5.33%');fireEvent.click(screen.getByRole('button',{name:'Čačak'}));await screen.findByRole('button',{name:'Alpha'});expect(screen.getByRole('button',{name:'Zero'})).toBeInTheDocument();expect(screen.getAllByText('62.5%').length).toBeGreaterThan(0);expect(screen.queryByRole('button',{name:'Beta'})).toBeNull();});
 it('opens departure detail lazily and paginates server-side',async()=>{mount();await screen.findByText('5.33%');expect(mocks.rpc.mock.calls.some(c=>c[0]==='get_turnover_events')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'16'}));await screen.findByText('Demo Driver');expect(screen.getByText('Departure reason')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'Next'}));await waitFor(()=>expect(mocks.rpc.mock.calls.some(c=>c[0]==='get_turnover_events'&&c[1].p_offset===50)).toBe(true));});
 it('keeps March in the existing list instead of generating new metrics',async()=>{mount();await screen.findByText('5.33%');fireEvent.change(screen.getByLabelText('Turnover month'),{target:{value:'2026-03'}});await screen.findByText(/March and earlier records are unchanged/);fireEvent.click(screen.getByRole('button',{name:'Open existing turnover list'}));expect(mocks.legacy).toHaveBeenCalled();const dates=mocks.legacy.mock.calls[0][0];expect(dates.from.getMonth()).toBe(2);expect(dates.to.getDate()).toBe(31);});
 it('shows backend permission/errors and an explicit retry',async()=>{mocks.rpc.mockResolvedValue({data:null,error:{message:'Turnover analytics requires admin access'}});mount();expect(await screen.findByRole('alert')).toHaveTextContent('admin access');});
});

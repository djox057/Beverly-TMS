import { render,screen,fireEvent } from '@testing-library/react';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe,it,expect,vi } from 'vitest';
import TurnoverList from './TurnoverList';
vi.mock('@/components/TurnoverDashboard',()=>({TurnoverDashboard:({onLegacy}:any)=><button onClick={()=>onLegacy({from:new Date('2026-03-01T12:00:00'),to:new Date('2026-03-31T12:00:00')})}>View March without changes</button>}));
vi.mock('@/components/ui/date-range-picker',()=>({DateRangePicker:({date}:any)=><div>{date?.from?.getMonth()===2?'Original March date range':'Choose dates'}</div>}));
vi.mock('@/components/TranslateNoteButton',()=>({TranslateNoteButton:()=>null}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>{const b:any={select:()=>b,not:()=>b,neq:()=>b,in:()=>b,eq:()=>b,gte:()=>b,lte:()=>b,then:(r:any)=>Promise.resolve({data:[],error:null}).then(r)};return b;}}}));
describe('Turnover page',()=>{it('preserves March through the existing list and its date range',async()=>{
 render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><TurnoverList/></QueryClientProvider></MemoryRouter>);
 fireEvent.click(screen.getByRole('button',{name:'View March without changes'}));
 expect(screen.getByRole('tab',{name:'Existing turnover list'})).toHaveAttribute('aria-selected','true');
 expect(await screen.findByText('Original March date range')).toBeInTheDocument();
});});

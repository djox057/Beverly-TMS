import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import TurnoverList from './TurnoverList';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), drivers: [] as unknown[] }));
vi.mock('@/contexts/AuthContext', () => ({ useAuthContext: () => ({ user: { id: 'admin' } }) }));
vi.mock('@/components/TurnoverDashboard', () => ({
  TurnoverDashboard: ({ onLegacy }: any) => <button onClick={() => onLegacy({ from: new Date('2026-03-01T12:00:00'), to: new Date('2026-03-31T12:00:00') })}>View March without changes</button>,
}));
vi.mock('@/components/ui/date-range-picker', () => ({
  DateRangePicker: ({ date, onDateChange }: any) => <div>
    {date?.from?.getMonth() === 2 ? 'Original March date range' : 'Choose dates'}
    <button onClick={() => onDateChange({ from: new Date('2026-04-01T12:00:00'), to: new Date('2026-04-30T12:00:00') })}>Choose April</button>
  </div>,
}));
vi.mock('@/components/TranslateNoteButton', () => ({ TranslateNoteButton: () => null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: (...args: unknown[]) => mocks.rpc(...args),
  from: (table: string) => {
    const b: any = { select: () => b, not: () => b, neq: () => b, in: () => b, eq: () => b, gte: () => b, lte: () => b,
      then: (r: any) => Promise.resolve({ data: table === 'drivers' ? mocks.drivers : [], error: null }).then(r) };
    return b;
  },
} }));
const mount = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><TurnoverList /></QueryClientProvider></MemoryRouter>);
beforeEach(() => {
  mocks.drivers = [];
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: [{ dispatcher_id: 'former', dispatcher_name: 'Former Dispatcher', office: 'Čačak' }], error: null });
});

describe('Turnover page', () => {
  it('defaults to the first Turnover list tab and preserves March when returning from Metrics', async () => {
    mount();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Turnover list', 'Metrics']);
    expect(screen.getByRole('tab', { name: 'Turnover list' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'View March without changes' })).toBeNull();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Metrics' }), { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByRole('button', { name: 'View March without changes' }));
    expect(screen.getByRole('tab', { name: 'Turnover list' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByText('Original March date range')).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('shows a former dispatcher under their recovered office for April departures', async () => {
    mocks.drivers = [{ id: 'driver', name: 'Departed Driver', termination_date: '2026-04-12', last_dispatcher_id: 'former', last_dispatcher_name: 'Former Dispatcher', driver_termination_notes: [] }];
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Choose April' }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('get_turnover_dispatcher_directory'));
    expect(await screen.findByText('Former Dispatcher (former)')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Čačak' })).toBeInTheDocument();
  });
});

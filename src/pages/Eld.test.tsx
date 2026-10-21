import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EldDay } from '@/lib/eld';
import { eldToday } from '@/lib/eld';
import Eld from './Eld';

const mocks = vi.hoisted(() => ({ day: {} as { data: EldDay }, save: vi.fn(), manage: vi.fn(), pendingCheckKeys: new Set<string>() }));
vi.mock('@/hooks/useEld', () => ({ useEldDay: () => ({
  day: { ...mocks.day, refetch: vi.fn() },
  pendingCheckKeys: mocks.pendingCheckKeys, pendingAssignments: new Set<string>(), pendingTasks: new Set<string>(), addingTask: false, hasPendingWrites: false,
  saveCheck: { mutate: mocks.save, mutateAsync: mocks.save, isPending: false },
  manage: { mutate: mocks.manage, mutateAsync: mocks.manage, isPending: false },
}) }));
vi.mock('@/components/eld/EldActivityLog', () => ({ EldActivityLog: () => <div>Activity log</div> }));
const today = eldToday();
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pendingCheckKeys = new Set();
  mocks.day = { data: { today, can_manage: false, can_work: true, workers: [{ user_id: 'worker', name: 'ELD Person' }], tasks: [], checks: [{
    id: 'check', work_date: today, driver_id: 'driver', driver_name: 'Assigned Driver', truck_number: '460', worker_id: 'worker', worker_name: 'ELD Person',
    yesterday_log: false, forms: false, pti: false, comment: '', updated_by: null, updated_at: new Date().toISOString(),
  }] } };
});
describe('ELD page', () => {
  it('saves only the selected field and hides assignment controls for a worker', () => {
    render(<Eld />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'yesterday log for Assigned Driver' }));
    expect(mocks.save).toHaveBeenCalledWith({ id: 'check', field: 'yesterday_log', value: true });
    expect(screen.queryByRole('combobox', { name: /Assign ELD person/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Team overview' })).not.toBeInTheDocument();
  });
  it('keeps other controls usable while one checkbox is saving', () => {
    mocks.pendingCheckKeys.add('check:pti');
    render(<Eld />);
    expect(screen.getByRole('checkbox', { name: 'pti for Assigned Driver' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'forms for Assigned Driver' })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Edit Note · Assigned Driver/ })).toBeEnabled();
  });
  it('exposes assignment and team overview to ELD managers', () => {
    mocks.day.data.can_manage = true;
    render(<Eld />);
    expect(screen.getByRole('combobox', { name: /Assign ELD person/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Team overview' })).toBeInTheDocument();
  });
  it('keeps historical worker checklists read-only', () => {
    mocks.day.data.today = '2099-01-01';
    render(<Eld />);
    expect(screen.getByRole('checkbox', { name: 'pti for Assigned Driver' })).toBeDisabled();
  });
  it('uses the Live Oil Change note editor and saves only after explicit Save', async () => {
    render(<Eld />);
    fireEvent.click(screen.getByRole('button', { name: /Edit Note · Assigned Driver/ }));
    fireEvent.change(screen.getByRole('textbox', { name: /Note · Assigned Driver/ }), { target: { value: 'Reviewed shipping forms' } });
    expect(mocks.save).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save' })); });
    expect(mocks.save).toHaveBeenCalledWith({ id: 'check', field: 'comment', value: 'Reviewed shipping forms' });
  });
});

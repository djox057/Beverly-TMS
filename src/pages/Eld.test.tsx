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
  it('counts only drivers matching the selected search, worker and completion filters', () => {
    HTMLElement.prototype.hasPointerCapture = () => false;
    HTMLElement.prototype.scrollIntoView = () => {};
    mocks.day.data.can_manage = true;
    const base = mocks.day.data.checks[0];
    mocks.day.data.checks.push(
      { ...base, id: 'done', driver_id: 'done', driver_name: 'Completed Driver', truck_number: '461', yesterday_log: true, forms: true, pti: true },
      { ...base, id: 'idle', driver_id: 'idle', driver_name: 'Unassigned Driver', truck_number: '462', worker_id: null, worker_name: null },
    );
    render(<Eld />);
    const expectCounts = (values: number[]) => {
      ['Drivers', 'Completed', 'Incomplete', 'Unassigned'].forEach((label, index) => {
        expect(screen.getByText(label, { selector: 'p' }).nextElementSibling).toHaveTextContent(new RegExp(`^${values[index]}$`));
      });
    };
    expectCounts([3, 1, 2, 1]);
    const search = screen.getByRole('textbox', { name: 'Search drivers, trucks or ELD person' });
    fireEvent.change(search, { target: { value: '461' } });
    expectCounts([1, 1, 0, 0]);
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter ELD person' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Unassigned' }));
    expectCounts([1, 0, 1, 1]);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter completion' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Completed' }));
    expectCounts([0, 0, 0, 0]);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter ELD person' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'All ELD people' }));
    expectCounts([1, 1, 0, 0]);
  });
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

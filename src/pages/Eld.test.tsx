import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { EldDay } from '@/lib/eld';
import { eldToday } from '@/lib/eld';
import Eld from './Eld';

const mocks = vi.hoisted(() => ({ day: {} as { data: EldDay }, save: vi.fn(), manage: vi.fn(), pendingCheckKeys: new Set<string>() }));
vi.mock('@/hooks/useEldCompanies', () => ({ useEldCompanies: () => ({ data: { trucks: new Map([['461', 'bf']]), drivers: new Map([['driver', 'ap'], ['second-driver', 'ap']]), names: new Map([['bf', 'BF Prime'], ['ap', 'AP Silver']]) }, isPending: false, isError: false }) }));
vi.mock('@/hooks/useEld', () => ({ useEldDay: () => ({
  day: { ...mocks.day, refetch: vi.fn() },
  pendingCheckKeys: mocks.pendingCheckKeys, pendingAssignments: new Set<string>(), pendingTasks: new Set<string>(), addingTask: false, hasPendingWrites: false,
  saveCheck: { mutate: mocks.save, mutateAsync: mocks.save, isPending: false },
  manage: { mutate: mocks.manage, mutateAsync: mocks.manage, isPending: false },
}) }));
vi.mock('@/components/eld/EldActivityLog', () => ({ EldActivityLog: () => <div>Activity log</div> }));
const today = eldToday();
beforeEach(() => {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
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
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter company' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'AP Silver' }));
    expectCounts([0, 0, 0, 0]);
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Filter company' }), { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'BF Prime' }));
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

it('shows Deleted accounts only as editable for recently done drivers', () => {
  mocks.day.data.checks[0].inactive_at = new Date().toISOString();
  render(<Eld />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Deleted accounts for Assigned Driver' }));
  expect(mocks.save).toHaveBeenCalledWith({ id: 'check', field: 'deleted_accounts', value: true });
});
it('bulk assigns a dispatcher group to the selected ELD worker', async () => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => {};
  mocks.day.data.can_manage = true;
  mocks.day.data.assignment_groups = [{ scope: 'dispatcher', id: 'dispatch', name: 'Dispatcher A', trucks: 3, drivers: 4 }];
  render(<Eld />);
  fireEvent.click(screen.getByRole('button', { name: 'Bulk assign trucks' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Bulk assignment group' }));
  fireEvent.click(screen.getByRole('option', { name: 'Dispatcher A (3 trucks)' }));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Bulk assignment ELD person' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('option', { name: 'ELD Person' }));
  expect(screen.getByText('3 trucks · teams count as one assignment')).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Assign all trucks' })); });
  expect(mocks.manage).toHaveBeenCalledWith({ action: 'bulk_assign', payload: { scope: 'dispatcher', group_id: 'dispatch', worker_id: 'worker' } });
});

it('keeps bulk assignment visible across tabs for managers', () => {
  mocks.day.data.can_manage = true;
  render(<Eld />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Team overview' }), { button: 0, ctrlKey: false });
  expect(screen.getByRole('button', { name: 'Bulk assign trucks' })).toBeEnabled();
});
it('shows a disabled bulk assignment button on historical dates', () => {
  mocks.day.data.can_manage = true;
  mocks.day.data.today = '2099-01-01';
  render(<Eld />);
  expect(screen.getByRole('button', { name: 'Bulk assign trucks' })).toBeDisabled();
});

it('counts a team once, reveals names, and assigns/checks both drivers', () => {
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => {};
  mocks.day.data.can_manage = true;
  mocks.day.data.checks.push({ ...mocks.day.data.checks[0], id: 'second', driver_id: 'second-driver', driver_name: 'Second Driver' });
  render(<Eld />);
  expect(screen.getByText('Drivers', { selector: 'p' }).nextElementSibling).toHaveTextContent(/^1$/);
  expect(screen.queryByText('Second Driver')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Show team names for truck 460' }));
  expect(screen.getByText('Assigned Driver')).toBeInTheDocument();
  expect(screen.getByText('Second Driver')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Assign ELD person for Team' }), { key: 'ArrowDown' });
  fireEvent.click(screen.getByRole('option', { name: 'Unassigned' }));
  expect(mocks.manage).toHaveBeenCalledWith({ action: 'assign', payload: { driver_id: 'driver', worker_id: null } });
  expect(mocks.manage).toHaveBeenCalledWith({ action: 'assign', payload: { driver_id: 'second-driver', worker_id: null } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'pti for Team' }));
  expect(mocks.save).toHaveBeenCalledWith({ id: 'check', field: 'pti', value: true });
  expect(mocks.save).toHaveBeenCalledWith({ id: 'second', field: 'pti', value: true });
  fireEvent.change(screen.getByRole('textbox', { name: 'Search drivers, trucks or ELD person' }), { target: { value: 'Second Driver' } });
  expect(screen.getByRole('button', { name: 'Show team names for truck 460' })).toBeInTheDocument();
});

it('searches dispatchers in bulk assignment and keeps the selected dispatcher', () => {
  HTMLElement.prototype.scrollIntoView = () => {};
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
  mocks.day.data.can_manage = true;
  mocks.day.data.assignment_groups = [
    { scope: 'dispatcher', id: 'ace', name: 'Ace', trucks: 5, drivers: 6 },
    { scope: 'dispatcher', id: 'alex', name: 'Alex', trucks: 4, drivers: 4 },
  ];
  render(<Eld />);
  fireEvent.click(screen.getByRole('button', { name: 'Bulk assign trucks' }));
  fireEvent.click(screen.getByRole('combobox', { name: 'Bulk assignment group' }));
  fireEvent.change(screen.getByPlaceholderText('Search dispatchers…'), { target: { value: 'alex' } });
  expect(screen.queryByRole('option', { name: /Ace/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Alex (4 trucks)' }));
  expect(screen.getByRole('combobox', { name: 'Bulk assignment group' })).toHaveTextContent('Alex (4 trucks)');
});

it('shows company counts and a pie for each ELD person with teams counted once', () => {
  mocks.day.data.can_manage = true;
  const base = mocks.day.data.checks[0];
  mocks.day.data.checks.push(
    { ...base, id: 'teammate', driver_id: 'second-driver', driver_name: 'Second Driver' },
    { ...base, id: 'bf-driver', driver_id: 'bf-driver', truck_number: '461', driver_name: 'BF Driver' },
  );
  render(<Eld />);
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Team overview' }), { button: 0, ctrlKey: false });
  expect(screen.getByRole('img', { name: 'Company distribution for ELD Person' })).toBeInTheDocument();
  const table = screen.getByRole('table', { name: 'Company counts for ELD Person' });
  expect(table).toHaveTextContent('AP Silver150%');
  expect(table).toHaveTextContent('BF Prime150%');
  expect(screen.getByText('2 drivers / teams')).toBeInTheDocument();
});

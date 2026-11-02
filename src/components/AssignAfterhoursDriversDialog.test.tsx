import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssignAfterhoursDriversDialog from './AssignAfterhoursDriversDialog';

// Native controls make the bulk action test independent of Radix pointer APIs.
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: any) => <select value={value} onChange={e => onValueChange(e.target.value)}>{children}</select>,
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
}));

const driver = (id: string, company: string, office: string) => ({
  id, name: `Driver ${id}`, company_name: company,
  dispatcher_id: `dispatcher-${id}`, dispatcher_name: `Dispatcher ${id}`, dispatcher_office: office,
  truck: { id: `truck-${id}`, truck_number: id, driver1_id: id, driver2_id: null, company_name: 'Truck company is irrelevant' },
});
const teamTruck = { id: 'team-truck', truck_number: 'TEAM-1', driver1_id: 'team1', driver2_id: 'team2' };
const drivers = [driver('a1','Company A','Čačak'), driver('a2','Company A','BG 1st floor'),
  driver('b','Company B','Čačak'), driver('assigned','Company A','Čačak'),
  { ...driver('team1','Company A','KRAGUJEVAC'), truck: teamTruck },
  { ...driver('team2','Company A','KRAGUJEVAC'), truck: teamTruck }];
afterEach(cleanup);
const mount = () => {
  const onAssign = vi.fn().mockResolvedValue(undefined);
  render(<AssignAfterhoursDriversDialog open onOpenChange={vi.fn()} allDrivers={drivers}
    alreadyAssignedIds={new Set(['assigned'])} onAssign={onAssign} />);
  return onAssign;
};
const chooseCompany = (name: string) => fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: name } });

describe('Bulk selection by driver company', () => {
  it('selects all available company drivers across offices/search and expands teams when saving', async () => {
    const assign = mount();
    chooseCompany('Company A');
    fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'Čačak' } });
    fireEvent.change(screen.getByPlaceholderText('Search drivers, trucks, dispatchers...'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: /Select company/ }));
    expect(screen.getByPlaceholderText('Search drivers, trucks, dispatchers...')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: /^Assign 3 Drivers$/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(new Set(assign.mock.calls[0][0])).toEqual(new Set(['a1','a2','team1','team2']));
  });
  it('deselects a whole company while preserving previously selected drivers from other companies', async () => {
    const assign = mount();
    const label = screen.getByText('Driver b').closest('label')!;
    fireEvent.click(within(label).getByRole('checkbox'));
    chooseCompany('Company A');
    fireEvent.click(screen.getByRole('button', { name: /Select company/ }));
    fireEvent.click(screen.getByRole('button', { name: /Deselect company/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Assign 1 Driver$/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith(['b']));
  });
  it('requires a specific driver company before bulk selection', () => {
    mount();
    expect(screen.getByRole('button', { name: /Select company/ })).toBeDisabled();
  });
});

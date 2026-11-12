import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { OilChangeStatistics } from './OilChangeStatistics';

afterEach(cleanup);
it('sorts both dispatcher count columns in both directions without changing the truck selection', () => {
  const truck = { source: 'BF TRUCK', miles: 30001, last_oil_change_miles: 0, air_filter: null };
  const fresh = new Date().toISOString();
  const trucks = [
    { ...truck, dispatcher_id: 'a', dispatcher_name: 'Alex', miles_updated_at: fresh },
    { ...truck, dispatcher_id: 'a', dispatcher_name: 'Alex', miles_updated_at: fresh },
    { ...truck, dispatcher_id: 'b', dispatcher_name: 'Bob', miles_updated_at: null },
    { ...truck, dispatcher_id: 'b', dispatcher_name: 'Bob', miles_updated_at: null, miles: 100 },
    { ...truck, dispatcher_id: 'b', dispatcher_name: 'Bob', miles_updated_at: null, miles: 100 },
    { ...truck, dispatcher_id: 'c', dispatcher_name: 'Cara', miles_updated_at: null, miles: 100 },
  ];
  const onSelect = vi.fn();
  render(<OilChangeStatistics trucks={trucks} loading={false} error={false} onSelect={onSelect} />);
  const table = screen.getByRole('table', { name: 'Overdue oil changes by dispatcher' });
  const names = () => within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent);
  const overdue = within(table).getByRole('button', { name: 'Overdue trucks' });
  const notUpdated = within(table).getByRole('button', { name: 'Not updated', exact: true });
  expect(names()).toEqual(['Alex', 'Bob', 'Cara']);
  expect(overdue.closest('th')).toHaveAttribute('aria-sort', 'descending');
  fireEvent.click(overdue);
  expect(names()).toEqual(['Cara', 'Bob', 'Alex']);
  expect(overdue.closest('th')).toHaveAttribute('aria-sort', 'ascending');
  fireEvent.click(overdue);
  expect(names()).toEqual(['Alex', 'Bob', 'Cara']);
  fireEvent.click(notUpdated);
  expect(names()).toEqual(['Bob', 'Cara', 'Alex']);
  expect(notUpdated.closest('th')).toHaveAttribute('aria-sort', 'descending');
  expect(overdue.closest('th')).toHaveAttribute('aria-sort', 'none');
  fireEvent.click(notUpdated);
  expect(names()).toEqual(['Alex', 'Cara', 'Bob']);
  expect(notUpdated.closest('th')).toHaveAttribute('aria-sort', 'ascending');
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Show not updated mileage for Bob' }));
  expect(onSelect).toHaveBeenCalledWith({ category: 'mileage', status: 'Not updated', dispatcherId: 'b', dispatcherName: 'Bob' });
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Holidays from './Holidays';
import { currentHolidayYear } from '@/lib/holidays';

vi.mock('@/components/holidays/HolidayReportTable', () => ({ HolidayReportTable: ({ year, holidaySlug }: { year: number; holidaySlug: string }) => <div data-testid="report">{year}/{holidaySlug}</div> }));
afterEach(cleanup);
function Location() { return <div data-testid="location">{useLocation().pathname}</div>; }
function open(path: string) {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Location /><Routes>{['/holidays', '/holidays/:year', '/holidays/:year/:holidaySlug'].map(route => <Route key={route} path={route} element={<Holidays />} />)}</Routes></MemoryRouter>);
}
it('defaults to the current year and shows all twelve months with only the six holidays', () => {
  open('/holidays');
  expect(screen.getByLabelText('Year')).toHaveValue(String(currentHolidayYear()));
  expect(screen.getAllByRole('region')).toHaveLength(6);
  expect(screen.getAllByRole('link')).toHaveLength(6);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(String(currentHolidayYear()));
  expect(screen.queryByText(/little celebrations/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Thanksgiving/ })).toHaveAttribute('href', `/holidays/${currentHolidayYear()}/thanksgiving`);
});
it('opens the exact holiday, then switches its year and returns to that year calendar', () => {
  open('/holidays/2026');
  fireEvent.click(screen.getByRole('link', { name: /Thanksgiving/ }));
  expect(screen.getByTestId('location')).toHaveTextContent('/holidays/2026/thanksgiving');
  expect(screen.getByText('Thursday, November 26, 2026')).toBeInTheDocument();
  expect(screen.getByTestId('report')).toHaveTextContent('2026/thanksgiving');
  fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2027' } });
  expect(screen.getByText('Thursday, November 25, 2027')).toBeInTheDocument();
  expect(screen.getByTestId('report')).toHaveTextContent('2027/thanksgiving');
  fireEvent.click(screen.getByRole('link', { name: 'All holidays' }));
  expect(screen.getByTestId('location')).toHaveTextContent('/holidays/2027');
});
it.each(['/holidays/not-a-year', '/holidays/2026/not-a-holiday', '/holidays/2026/good-friday'])('handles invalid deep links: %s', path => {
  open(path);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/not found/);
  expect(screen.queryByTestId('report')).not.toBeInTheDocument();
});

it('moves between holidays across years in both directions', () => {
  open('/holidays/2026/thanksgiving');
  fireEvent.click(screen.getByRole('button', { name: 'Next holiday' }));
  expect(screen.getByTestId('report')).toHaveTextContent('2026/christmas');
  fireEvent.click(screen.getByRole('button', { name: 'Next holiday' }));
  expect(screen.getByTestId('report')).toHaveTextContent('2027/new-years-day');
  fireEvent.click(screen.getByRole('button', { name: 'Previous holiday' }));
  expect(screen.getByTestId('report')).toHaveTextContent('2026/christmas');
});
it('stops at the first and last supported holiday', () => {
  const view = open('/holidays/2000/new-years-day');
  expect(screen.getByRole('button', { name: 'Previous holiday' })).toBeDisabled();
  view.unmount();
  open('/holidays/2099/christmas');
  expect(screen.getByRole('button', { name: 'Next holiday' })).toBeDisabled();
});

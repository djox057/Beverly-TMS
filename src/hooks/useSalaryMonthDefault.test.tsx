import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import type { DateRange } from 'react-day-picker';
import { useSalaryMonthDefault } from './useSalaryMonthDefault';

function usePeriod(initialTab = 'performance', initialWeek = 'all', initialRange?: DateRange) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedMonth, setMonth] = useState('all');
  const [selectedWeek, setWeek] = useState(initialWeek);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(initialRange);
  const onSelectMonth = (month: string) => { setMonth(month); setWeek('all'); setDateRange(undefined); };
  const onSelectWeek = (week: string) => { setWeek(week); setMonth('all'); setDateRange(undefined); };
  useSalaryMonthDefault({ activeTab, selectedMonth, selectedWeek, dateRange, onSelectMonth });
  return { activeTab, selectedMonth, selectedWeek, setActiveTab, onSelectMonth, onSelectWeek };
}
afterEach(() => vi.useRealTimers());

it('defaults on first salary entry and preserves All time monthly across renders and tab switches', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-12T18:00:00Z'));
  const { result, rerender } = renderHook(() => usePeriod());
  expect(result.current.selectedMonth).toBe('all');
  act(() => result.current.setActiveTab('salaries'));
  expect(result.current.selectedMonth).toBe('2026-10');
  act(() => result.current.onSelectMonth('all'));
  rerender();
  expect(result.current.selectedMonth).toBe('all');
  act(() => result.current.setActiveTab('performance'));
  act(() => result.current.setActiveTab('salaries'));
  expect(result.current.selectedMonth).toBe('all');
});
it('preserves selected weeks, all-time weekly and subsequent month selections', () => {
  const { result } = renderHook(() => usePeriod('salaries'));
  act(() => result.current.onSelectWeek('1'));
  expect(result.current.selectedWeek).toBe('1');
  expect(result.current.selectedMonth).toBe('all');
  act(() => result.current.onSelectWeek('all'));
  expect(result.current.selectedMonth).toBe('all');
  act(() => result.current.onSelectMonth('2026-09'));
  expect(result.current.selectedMonth).toBe('2026-09');
  expect(result.current.selectedWeek).toBe('all');
});
it('preserves a week or custom date range chosen before opening salaries', () => {
  const week = renderHook(() => usePeriod('salaries', '0'));
  expect(week.result.current.selectedWeek).toBe('0');
  expect(week.result.current.selectedMonth).toBe('all');
  const custom = renderHook(() => usePeriod('salaries', 'all', { from: new Date(2026, 9, 1), to: new Date(2026, 9, 7) }));
  expect(custom.result.current.selectedMonth).toBe('all');
});
it.each([
  ['2026-11-16T05:30:00Z', '2026-10'], // Still the 15th in Chicago.
  ['2026-11-16T18:00:00Z', '2026-11'],
  ['2026-01-12T18:00:00Z', '2025-12'],
  ['2026-03-12T18:00:00Z', '2026-02'],
])('keeps the Chicago salary-month default for %s', (now, month) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(now));
  const { result } = renderHook(() => usePeriod('salaries'));
  expect(result.current.selectedMonth).toBe(month);
});

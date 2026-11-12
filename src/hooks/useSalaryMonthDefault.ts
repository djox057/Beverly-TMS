import { useEffect, useRef } from 'react';
import type { DateRange } from 'react-day-picker';

/** Apply the salary month once; explicit week/month/all-time choices must stick. */
export function useSalaryMonthDefault({ activeTab, selectedMonth, selectedWeek, dateRange, onSelectMonth }: {
  activeTab: string;
  selectedMonth: string;
  selectedWeek: string;
  dateRange: DateRange | undefined;
  onSelectMonth: (month: string) => void;
}) {
  const initialized = useRef(false);
  useEffect(() => {
    if (activeTab !== 'salaries' || initialized.current) return;
    initialized.current = true;
    if (selectedMonth !== 'all' || selectedWeek !== 'all' || dateRange) return;
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric',
    }).formatToParts(new Date());
    const part = (type: string) => Number(parts.find(item => item.type === type)?.value);
    const month = new Date(part('year'), part('month') - 1 - (part('day') <= 15 ? 1 : 0), 1);
    onSelectMonth(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`);
  }, [activeTab, selectedMonth, selectedWeek, dateRange, onSelectMonth]);
}

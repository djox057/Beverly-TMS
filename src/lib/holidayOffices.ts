export const HOLIDAY_OFFICES = ['Čačak', 'KRAGUJEVAC', 'BG 1st FLOOR', 'BG 4th FLOOR', 'BEOGRAD', 'Recovery', 'Other'];
export function holidayOffice(value?: string | null): string {
  const name = value?.trim() || 'Other';
  const upper = name.toUpperCase();
  if (upper === 'CACAK' || upper === 'ČAČAK') return 'Čačak';
  if (upper === 'RECOVERY') return 'Recovery';
  return HOLIDAY_OFFICES.find(office => office.toUpperCase() === upper) ?? name;
}

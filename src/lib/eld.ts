import { formatInTimeZone } from 'date-fns-tz';

export type EldCheckField = 'yesterday_log' | 'forms' | 'pti' | 'comment';
export type EldWorker = { user_id: string; name: string };
export type EldCheck = {
  id: string; work_date: string; driver_id: string; driver_name: string;
  truck_number: string; worker_id: string | null; worker_name: string | null;
  yesterday_log: boolean; forms: boolean; pti: boolean; comment: string;
  updated_by: string | null; updated_at: string;
};
export type EldTask = {
  id: string; work_date: string; worker_id: string; description: string;
  completed: boolean; completed_by: string | null; completed_at: string | null;
  created_by: string; created_at: string; updated_at: string;
};
export type EldDay = {
  today: string; can_manage: boolean; can_work: boolean;
  checks: EldCheck[]; workers: EldWorker[]; tasks: EldTask[];
};
export type EldActivity = {
  id: string; work_date: string; entity_type: string; entity_id: string;
  worker_id: string | null; actor_id: string; action: string;
  before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null;
  created_at: string;
};
export const eldToday = (now: Date = new Date()) => formatInTimeZone(now, 'America/Chicago', 'yyyy-MM-dd');
export const isEldWeekday = (date: string) => {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
};
export const eldComplete = (row: Pick<EldCheck, 'yesterday_log' | 'forms' | 'pti'>) => row.yesterday_log && row.forms && row.pti;
export const filterEldChecks = (rows: EldCheck[], search: string, worker: string, status: string) => {
  const needle = search.trim().toLowerCase();
  return rows.filter(row =>
    (!needle || `${row.truck_number} ${row.driver_name} ${row.worker_name ?? ''}`.toLowerCase().includes(needle)) &&
    (worker === 'all' || (worker === 'unassigned' ? !row.worker_id : row.worker_id === worker)) &&
    (status === 'all' || (status === 'complete' ? eldComplete(row) : !eldComplete(row)))
  );
};

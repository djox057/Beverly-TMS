import { formatInTimeZone } from 'date-fns-tz';

export type EldCheckField = 'yesterday_log' | 'forms' | 'pti' | 'comment' | 'deleted_accounts';
export type EldWorker = { user_id: string; name: string };
export type EldCheck = {
  members?: EldCheck[];
  inactive_at?: string | null; deleted_accounts?: boolean;
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
export type EldAssignmentGroup = { scope: 'dispatcher' | 'company'; id: string; name: string; trucks: number; drivers: number };
export type EldDay = {
  assignment_groups?: EldAssignmentGroup[];
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
    (!needle || `${row.truck_number} ${row.driver_name} ${row.worker_name ?? ''} ${(row.members ?? []).map(m => `${m.driver_name} ${m.worker_name ?? ''}`).join(' ')}`.toLowerCase().includes(needle)) &&
    (worker === 'all' || (row.members ?? [row]).some(m => worker === 'unassigned' ? !m.worker_id : m.worker_id === worker)) &&
    (status === 'all' || (status === 'complete' ? eldComplete(row) : !eldComplete(row)))
  );
};

/** Group before filtering so finding either teammate keeps the entire truck row. */
export function groupEldChecks(checks: EldCheck[], companyFor: (row: EldCheck) => string | null = () => null): EldCheck[] {
  const groups = new Map<string, EldCheck[]>();
  for (const check of checks) {
    // Done drivers remain separate from replacement drivers in the same unit.
    const key = check.truck_number ? JSON.stringify([check.work_date, check.truck_number, companyFor(check), !!check.inactive_at]) : check.id;
    const members = groups.get(key) ?? [];
    members.push(check); groups.set(key, members);
  }
  return [...groups.values()].map(members => {
    const first = members[0];
    if (members.length === 1) return first;
    const sameWorker = members.every(m => m.worker_id === first.worker_id);
    const sameNote = members.every(m => m.comment === first.comment);
    return { ...first, members, driver_name: 'Team',
      worker_id: sameWorker ? first.worker_id : '__mixed__', worker_name: sameWorker ? first.worker_name : 'Mixed assignments',
      yesterday_log: members.every(m => m.yesterday_log), forms: members.every(m => m.forms), pti: members.every(m => m.pti),
      deleted_accounts: members.every(m => m.deleted_accounts),
      comment: sameNote ? first.comment : members.filter(m => m.comment).map(m => `${m.driver_name}: ${m.comment}`).join('\n'),
    };
  }).sort((a, b) => Number(!!b.inactive_at) - Number(!!a.inactive_at));
}

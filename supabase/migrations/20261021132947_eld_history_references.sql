-- Live assignments follow account deletion; historical snapshots retain their IDs
-- and names even after the source driver/profile is removed. Validated RPCs and
-- read-only table grants continue to enforce identity checks on new writes.
alter table public.eld_assignments
  drop constraint eld_assignments_worker_id_fkey,
  drop constraint eld_assignments_updated_by_fkey,
  add constraint eld_assignments_worker_id_fkey foreign key(worker_id) references public.profiles(user_id) on delete set null,
  add constraint eld_assignments_updated_by_fkey foreign key(updated_by) references public.profiles(user_id) on delete set null;

alter table public.eld_daily_checks
  drop constraint eld_daily_checks_driver_id_fkey,
  drop constraint eld_daily_checks_worker_id_fkey,
  drop constraint eld_daily_checks_updated_by_fkey;

alter table public.eld_side_tasks
  drop constraint eld_side_tasks_worker_id_fkey,
  drop constraint eld_side_tasks_completed_by_fkey,
  drop constraint eld_side_tasks_created_by_fkey;

create index eld_assignments_updated_by_idx on public.eld_assignments(updated_by);

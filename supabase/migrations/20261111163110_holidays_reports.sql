-- Holiday notes are independent from daily reports and their broader permissions.
create table public.holiday_report_entries (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2099),
  holiday_slug text not null check (holiday_slug in (
    'new-years-day','martin-luther-king-jr-day','valentines-day','presidents-day',
    'st-patricks-day','good-friday','easter','mothers-day','memorial-day','juneteenth',
    'fathers-day','independence-day','labor-day','columbus-day','halloween',
    'veterans-day','thanksgiving','black-friday','christmas-eve','christmas','new-years-eve'
  )),
  truck text not null default '' check (char_length(truck) <= 80),
  note text not null default '' check (char_length(note) <= 20000),
  created_at timestamptz not null default now()
);
create index holiday_report_entries_scope_idx
  on public.holiday_report_entries (year, holiday_slug, created_at, id);

alter table public.holiday_report_entries enable row level security;
revoke all on public.holiday_report_entries from anon, authenticated;
grant select, insert, update, delete on public.holiday_report_entries to authenticated;
grant all on public.holiday_report_entries to service_role;

-- Match useAuth.getPrimaryRole exactly: admin wins; safety/claims/accounting
-- precede manager. Never use inherited hasRole('manager') or user metadata.
create policy "Holiday notes admins and managers only"
on public.holiday_report_entries for all to authenticated
using ((select
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'::public.app_role)
  or (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'manager'::public.app_role)
    and not exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('safety'::public.app_role,'claims'::public.app_role,'accounting'::public.app_role))
  )
))
with check ((select
  exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin'::public.app_role)
  or (
    exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'manager'::public.app_role)
    and not exists (select 1 from public.user_roles where user_id = auth.uid() and role in ('safety'::public.app_role,'claims'::public.app_role,'accounting'::public.app_role))
  )
));

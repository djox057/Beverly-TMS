-- 1. Audit log table
create table public.role_flip_log (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid references public.afterhours_schedule(id) on delete set null,
  user_id uuid,
  dispatcher_name text,
  direction text not null check (direction in ('promote', 'revert')),
  action text not null check (action in ('flipped', 'skipped', 'error')),
  from_role app_role,
  to_role app_role,
  message text,
  chicago_date date,
  chicago_hour int,
  executed_at timestamptz not null default now()
);

create index role_flip_log_user_id_idx on public.role_flip_log (user_id, executed_at desc);
create index role_flip_log_chicago_date_idx on public.role_flip_log (chicago_date);
create index role_flip_log_action_idx on public.role_flip_log (action) where action in ('skipped', 'error');

alter table public.role_flip_log enable row level security;

create policy "Admins and managers can view role_flip_log"
  on public.role_flip_log for select
  using (public.has_any_role(array['admin'::app_role, 'manager'::app_role]));

-- 2. Flip function
create or replace function public.flip_afterhours_roles(direction text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  chicago_now timestamptz := now() at time zone 'America/Chicago';
  chicago_hour int := extract(hour from chicago_now)::int;
  chicago_date date := chicago_now::date;
  expected_hour int;
  from_role_val app_role;
  to_role_val app_role;
  rec record;
  current_roles app_role[];
  dispatcher_name_val text;
begin
  if direction = 'promote' then
    expected_hour := 6;
    from_role_val := 'dispatch'::app_role;
    to_role_val := 'afterhours'::app_role;
  elsif direction = 'revert' then
    expected_hour := 17;
    from_role_val := 'afterhours'::app_role;
    to_role_val := 'dispatch'::app_role;
  else
    raise exception 'Invalid direction: %, expected promote or revert', direction;
  end if;

  if chicago_hour <> expected_hour then
    return;
  end if;

  for rec in
    select s.id as schedule_id, s.user_id, s.dispatcher_name
    from public.afterhours_schedule s
    where s.scheduled_date = chicago_date
      and s.user_id is not null
  loop
    select array_agg(role) into current_roles
    from public.user_roles
    where user_id = rec.user_id;

    dispatcher_name_val := rec.dispatcher_name;

    if from_role_val = any(current_roles) and to_role_val = any(current_roles) then
      insert into public.role_flip_log
        (schedule_id, user_id, dispatcher_name, direction, action,
         from_role, to_role, message, chicago_date, chicago_hour)
      values
        (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'error',
         from_role_val, to_role_val,
         'Invariant violated: user has both dispatch and afterhours roles simultaneously. Manual intervention required.',
         chicago_date, chicago_hour);
      continue;
    end if;

    if to_role_val = any(current_roles) then
      insert into public.role_flip_log
        (schedule_id, user_id, dispatcher_name, direction, action,
         from_role, to_role, message, chicago_date, chicago_hour)
      values
        (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'skipped',
         from_role_val, to_role_val,
         'User already has target role',
         chicago_date, chicago_hour);
      continue;
    end if;

    if not (from_role_val = any(current_roles)) then
      insert into public.role_flip_log
        (schedule_id, user_id, dispatcher_name, direction, action,
         from_role, to_role, message, chicago_date, chicago_hour)
      values
        (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'skipped',
         from_role_val, to_role_val,
         format('User roles are %s; flip only handles dispatch<->afterhours', current_roles::text),
         chicago_date, chicago_hour);
      continue;
    end if;

    update public.user_roles
      set role = to_role_val
      where user_id = rec.user_id
        and role = from_role_val;

    insert into public.role_flip_log
      (schedule_id, user_id, dispatcher_name, direction, action,
       from_role, to_role, chicago_date, chicago_hour)
    values
      (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'flipped',
       from_role_val, to_role_val, chicago_date, chicago_hour);
  end loop;
end;
$$;

-- 3. Cron jobs (idempotent: unschedule first if exists)
do $$
begin
  perform cron.unschedule('afterhours-promote-cst');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('afterhours-promote-cdt');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('afterhours-revert-cst');
exception when others then null;
end $$;

do $$
begin
  perform cron.unschedule('afterhours-revert-cdt');
exception when others then null;
end $$;

select cron.schedule(
  'afterhours-promote-cst',
  '0 12 * * *',
  $cron$ select public.flip_afterhours_roles('promote'); $cron$
);

select cron.schedule(
  'afterhours-promote-cdt',
  '0 11 * * *',
  $cron$ select public.flip_afterhours_roles('promote'); $cron$
);

select cron.schedule(
  'afterhours-revert-cst',
  '0 23 * * *',
  $cron$ select public.flip_afterhours_roles('revert'); $cron$
);

select cron.schedule(
  'afterhours-revert-cdt',
  '0 22 * * *',
  $cron$ select public.flip_afterhours_roles('revert'); $cron$
);

-- 4. Realtime: add user_roles to publication (idempotent) + replica identity full
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_roles'
  ) then
    alter publication supabase_realtime add table public.user_roles;
  end if;
end $$;

alter table public.user_roles replica identity full;
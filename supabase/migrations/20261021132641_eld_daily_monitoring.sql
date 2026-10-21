-- Daily ELD work is independent of HOS providers. Dates always use Chicago time.
alter table public.profiles add column is_eld_manager boolean not null default false;

create schema if not exists eld_private;
revoke all on schema eld_private from public;
grant usage on schema eld_private to authenticated, service_role;

-- Profile self-service must never allow a user to grant themselves ELD access.
create function eld_private.protect_tags() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (TG_OP = 'INSERT' and (new.is_eld or new.is_eld_manager)) or
     (TG_OP = 'UPDATE' and (new.is_eld is distinct from old.is_eld or new.is_eld_manager is distinct from old.is_eld_manager)) then
    if not coalesce(public.has_role(auth.uid(), 'admin'), false)
       and current_user not in ('postgres', 'service_role', 'supabase_admin') then
      raise exception 'Only admins can change ELD tags' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger protect_eld_tags before insert or update on public.profiles
for each row execute function eld_private.protect_tags();

create table public.eld_assignments (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  worker_id uuid references public.profiles(user_id),
  updated_by uuid references public.profiles(user_id),
  updated_at timestamptz not null default now()
);
create index eld_assignments_worker_idx on public.eld_assignments(worker_id);

create table public.eld_daily_checks (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  driver_id uuid not null references public.drivers(id),
  driver_name text not null,
  truck_number text not null default '',
  worker_id uuid references public.profiles(user_id),
  worker_name text,
  yesterday_log boolean not null default false,
  forms boolean not null default false,
  pti boolean not null default false,
  comment text not null default '' check (length(comment) <= 5000),
  updated_by uuid references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  unique(work_date, driver_id),
  check (extract(isodow from work_date) between 1 and 5)
);
create index eld_daily_checks_worker_date_idx on public.eld_daily_checks(worker_id,work_date);

create table public.eld_side_tasks (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  worker_id uuid not null references public.profiles(user_id),
  description text not null check (length(btrim(description)) between 1 and 2000),
  completed boolean not null default false,
  completed_by uuid references public.profiles(user_id),
  completed_at timestamptz,
  created_by uuid not null references public.profiles(user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (extract(isodow from work_date) between 1 and 5)
);
create index eld_side_tasks_worker_date_idx on public.eld_side_tasks(worker_id,work_date);
create index eld_side_tasks_date_idx on public.eld_side_tasks(work_date);

create table public.eld_activity (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  entity_type text not null,
  entity_id uuid not null,
  worker_id uuid,
  actor_id uuid not null,
  action text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index eld_activity_date_idx on public.eld_activity(work_date,created_at desc);
create index eld_activity_worker_date_idx on public.eld_activity(worker_id,work_date);

create function eld_private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.has_role(auth.uid(),'admin') or
    (public.has_role(auth.uid(),'maintenance') and exists (
      select 1 from public.profiles where user_id=auth.uid() and is_eld_manager
    ))
  );
$$;
create function eld_private.is_worker() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and public.has_role(auth.uid(),'maintenance') and exists (
    select 1 from public.profiles where user_id=auth.uid() and (is_eld or is_eld_manager)
  );
$$;

alter table public.eld_assignments enable row level security;
alter table public.eld_daily_checks enable row level security;
alter table public.eld_side_tasks enable row level security;
alter table public.eld_activity enable row level security;
-- No browser writes: validated functions below also enforce field-level permissions.
revoke all on public.eld_assignments, public.eld_daily_checks, public.eld_side_tasks, public.eld_activity from anon, authenticated;
grant select on public.eld_assignments, public.eld_daily_checks, public.eld_side_tasks, public.eld_activity to authenticated;
create policy eld_assignments_read on public.eld_assignments for select to authenticated
using ((select eld_private.is_manager()) or ((select eld_private.is_worker()) and worker_id=(select auth.uid())));
create policy eld_checks_read on public.eld_daily_checks for select to authenticated
using ((select eld_private.is_manager()) or ((select eld_private.is_worker()) and worker_id=(select auth.uid())));
create policy eld_tasks_read on public.eld_side_tasks for select to authenticated
using ((select eld_private.is_manager()) or ((select eld_private.is_worker()) and worker_id=(select auth.uid())));
create policy eld_activity_read on public.eld_activity for select to authenticated
using ((select eld_private.is_manager()) or ((select eld_private.is_worker()) and (worker_id=(select auth.uid()) or actor_id=(select auth.uid()))));

-- Snapshot even untouched/unassigned drivers, so missed work remains visible in history.
-- Called by cron and on today's page load; never rebuild a historical roster.
create function eld_private.sync_today() returns void
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if extract(isodow from v_today) > 5 then return; end if;
  -- Serialize roster refreshes with assignments so a waiting refresh cannot restore
  -- an assignee read before another transaction committed.
  perform pg_advisory_xact_lock(hashtextextended('eld_daily_roster',0));
  insert into public.eld_daily_checks(work_date,driver_id,driver_name,truck_number,worker_id,worker_name)
  select v_today,d.id,coalesce(nullif(d.name,''),nullif(btrim(concat_ws(' ',d.first_name,d.last_name)),''),'Unnamed driver'),
    coalesce(t.truck_number,''),a.worker_id,coalesce(p.full_name,p.email)
  from public.drivers d
  left join public.eld_assignments a on a.driver_id=d.id
  left join public.profiles p on p.user_id=a.worker_id
  left join lateral (
    select tr.truck_number from public.trucks tr
    where tr.is_active and (tr.driver1_id=d.id or tr.driver2_id=d.id)
    order by tr.truck_number,tr.id limit 1
  ) t on true
  where d.is_active
  on conflict(work_date,driver_id) do update
    set driver_name=excluded.driver_name,truck_number=excluded.truck_number,
        worker_id=excluded.worker_id,worker_name=excluded.worker_name
  where (eld_daily_checks.driver_name,eld_daily_checks.truck_number,eld_daily_checks.worker_id,eld_daily_checks.worker_name)
    is distinct from (excluded.driver_name,excluded.truck_number,excluded.worker_id,excluded.worker_name);
end $$;

create function eld_private.get_day(p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_manager boolean := eld_private.is_manager();
  v_worker boolean := eld_private.is_worker();
  v_result jsonb;
begin
  if auth.uid() is null or not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'maintenance')) then
    raise exception 'ELD access denied' using errcode='42501';
  end if;
  if p_date is null or p_date > v_today then raise exception 'Select today or an earlier date'; end if;
  if p_date=v_today then perform eld_private.sync_today(); end if;
  select jsonb_build_object(
    'today',v_today,'can_manage',v_manager,'can_work',v_worker,
    'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.truck_number,c.driver_name) from public.eld_daily_checks c
      where c.work_date=p_date and (v_manager or (v_worker and c.worker_id=auth.uid()))
      and (p_date<>v_today or exists(select 1 from public.drivers d where d.id=c.driver_id and d.is_active))), '[]'::jsonb),
    'workers',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',coalesce(p.full_name,p.email)) order by coalesce(p.full_name,p.email))
      from public.profiles p where (v_manager or p.user_id=auth.uid()) and (p.is_eld or p.is_eld_manager)
      and exists(select 1 from public.user_roles r where r.user_id=p.user_id and r.role='maintenance')), '[]'::jsonb),
    'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.eld_side_tasks t
      where t.work_date=p_date and (v_manager or (v_worker and t.worker_id=auth.uid()))), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create function eld_private.save_check(p_id uuid,p_field text,p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.eld_daily_checks; v_before jsonb; v_after jsonb;
  v_manager boolean := eld_private.is_manager();
begin
  if auth.uid() is null then raise exception 'ELD access denied' using errcode='42501'; end if;
  select * into c from public.eld_daily_checks where id=p_id for update;
  if not found or not (v_manager or (eld_private.is_worker() and c.worker_id=auth.uid() and c.work_date=(now() at time zone 'America/Chicago')::date)) then
    raise exception 'ELD update denied' using errcode='42501';
  end if;
  if c.work_date=(now() at time zone 'America/Chicago')::date and not exists(select 1 from public.drivers where id=c.driver_id and is_active) then
    raise exception 'This driver is no longer active';
  end if;
  if p_field not in ('yesterday_log','forms','pti','comment') or p_field is null then raise exception 'Invalid ELD field'; end if;
  if p_value is null or (p_field='comment' and jsonb_typeof(p_value)<>'string') or
     (p_field<>'comment' and jsonb_typeof(p_value)<>'boolean') then raise exception 'Invalid ELD value'; end if;
  v_before := jsonb_build_object(p_field,to_jsonb(c)->p_field);
  if v_before = jsonb_build_object(p_field,p_value) then return; end if;
  update public.eld_daily_checks set
    yesterday_log=case when p_field='yesterday_log' then (p_value#>>'{}')::boolean else yesterday_log end,
    forms=case when p_field='forms' then (p_value#>>'{}')::boolean else forms end,
    pti=case when p_field='pti' then (p_value#>>'{}')::boolean else pti end,
    comment=case when p_field='comment' then p_value#>>'{}' else comment end,
    updated_by=auth.uid(),updated_at=now() where id=p_id;
  v_after := jsonb_build_object(p_field,p_value,'driver_name',c.driver_name);
  insert into public.eld_activity(work_date,entity_type,entity_id,worker_id,actor_id,action,before_data,after_data)
    values(c.work_date,'check',p_id,c.worker_id,auth.uid(),'updated',v_before,v_after);
end $$;

create function eld_private.manage(p_action text,p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_manager boolean := eld_private.is_manager(); v_today date := (now() at time zone 'America/Chicago')::date;
  v_driver uuid; v_worker uuid; v_old_worker uuid; v_id uuid; v_date date; t public.eld_side_tasks; v_completed boolean;
begin
  if auth.uid() is null then raise exception 'ELD access denied' using errcode='42501'; end if;
  if p_action in ('assign','add_task') then
    if not v_manager then raise exception 'ELD manager access required' using errcode='42501'; end if;
    v_worker := (p_payload->>'worker_id')::uuid;
    if v_worker is not null and not exists (
      select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id
      where p.user_id=v_worker and (p.is_eld or p.is_eld_manager) and r.role='maintenance'
    ) then raise exception 'Select a maintenance user with an ELD tag'; end if;
  end if;
  if p_action='assign' then
    perform pg_advisory_xact_lock(hashtextextended('eld_daily_roster',0));
    v_driver := (p_payload->>'driver_id')::uuid;
    -- Serialize assignment changes, including the first assignment for a driver.
    perform 1 from public.drivers where id=v_driver and is_active for update;
    if not found then raise exception 'Select an active driver'; end if;
    select worker_id into v_old_worker from public.eld_assignments where driver_id=v_driver;
    if v_old_worker is not distinct from v_worker then return; end if;
    insert into public.eld_assignments(driver_id,worker_id,updated_by) values(v_driver,v_worker,auth.uid())
      on conflict(driver_id) do update set worker_id=excluded.worker_id,updated_by=excluded.updated_by,updated_at=now();
    perform eld_private.sync_today();
    insert into public.eld_activity(work_date,entity_type,entity_id,worker_id,actor_id,action,before_data,after_data)
      values(v_today,'assignment',v_driver,v_worker,auth.uid(),'assigned',jsonb_build_object('worker_id',v_old_worker),
        jsonb_build_object('worker_id',v_worker,'driver_name',(select name from public.drivers where id=v_driver)));
  elsif p_action='add_task' then
    v_date := (p_payload->>'work_date')::date;
    if v_worker is null or v_date is null or v_date<>v_today then raise exception 'Side tasks must be assigned for today'; end if;
    insert into public.eld_side_tasks(work_date,worker_id,description,created_by)
      values(v_date,v_worker,btrim(p_payload->>'description'),auth.uid()) returning id into v_id;
    insert into public.eld_activity(work_date,entity_type,entity_id,worker_id,actor_id,action,after_data)
      values(v_date,'task',v_id,v_worker,auth.uid(),'created',jsonb_build_object('description',p_payload->>'description'));
  elsif p_action='complete_task' then
    select * into t from public.eld_side_tasks where id=(p_payload->>'id')::uuid for update;
    if not found or not (v_manager or (eld_private.is_worker() and t.worker_id=auth.uid() and t.work_date=v_today)) then
      raise exception 'Side task update denied' using errcode='42501';
    end if;
    if jsonb_typeof(p_payload->'completed') is distinct from 'boolean' then raise exception 'Invalid task status'; end if;
    v_completed := (p_payload->>'completed')::boolean;
    if v_completed=t.completed then return; end if;
    update public.eld_side_tasks set completed=v_completed,completed_by=case when v_completed then auth.uid() end,
      completed_at=case when v_completed then now() end,updated_at=now() where id=t.id;
    insert into public.eld_activity(work_date,entity_type,entity_id,worker_id,actor_id,action,before_data,after_data)
      values(t.work_date,'task',t.id,t.worker_id,auth.uid(),'updated',jsonb_build_object('completed',t.completed),
        jsonb_build_object('completed',v_completed,'description',t.description));
  else raise exception 'Unknown ELD action'; end if;
end $$;

-- Exposed RPCs run as invoker. Privileged implementations live in a non-exposed schema
-- and validate the caller on every request; internal snapshot helpers are not callable.
create function public.eld_get_day(p_date date) returns jsonb
language sql security invoker set search_path = '' as $$ select eld_private.get_day(p_date); $$;
create function public.eld_save_check(p_id uuid,p_field text,p_value jsonb) returns void
language sql security invoker set search_path = '' as $$ select eld_private.save_check(p_id,p_field,p_value); $$;
create function public.eld_manage(p_action text,p_payload jsonb) returns void
language sql security invoker set search_path = '' as $$ select eld_private.manage(p_action,p_payload); $$;

revoke all on all functions in schema eld_private from public,anon,authenticated;
grant execute on function eld_private.is_manager(),eld_private.is_worker(),eld_private.get_day(date),
  eld_private.save_check(uuid,text,jsonb),eld_private.manage(text,jsonb) to authenticated;
revoke all on function public.eld_get_day(date),public.eld_save_check(uuid,text,jsonb),public.eld_manage(text,jsonb) from public,anon;
grant execute on function public.eld_get_day(date),public.eld_save_check(uuid,text,jsonb),public.eld_manage(text,jsonb) to authenticated;

-- Hourly reconciliation also catches new/changed active drivers without a page visit.
-- Chicago date evaluation inside sync_today handles DST and skips weekends.
select cron.schedule('eld-daily-roster','5 * * * *','select eld_private.sync_today()');
select eld_private.sync_today();

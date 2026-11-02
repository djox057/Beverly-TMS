-- Capture the precise deactivation event, independently of later driver edits.
create table eld_private.departures (
  driver_id uuid primary key references public.drivers(id) on delete cascade,
  inactive_at timestamptz not null,
  truck_number text not null default '',
  deleted_accounts boolean not null default false
);
revoke all on eld_private.departures from public, anon, authenticated;
alter table eld_private.departures enable row level security;
-- Weekend snapshots contain only recently done drivers awaiting account deletion.
alter table public.eld_daily_checks drop constraint eld_daily_checks_work_date_check;
alter table public.eld_daily_checks add column deleted_accounts boolean not null default false;

create function eld_private.track_departure() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.is_active and not coalesce(new.is_active,false) then
    insert into eld_private.departures(driver_id,inactive_at,truck_number)
    select new.id,now(),coalesce((select truck_number from public.trucks
      where driver1_id=new.id or driver2_id=new.id order by is_active desc,truck_number,id limit 1),'')
    on conflict(driver_id) do update set inactive_at=excluded.inactive_at,
      truck_number=excluded.truck_number,deleted_accounts=false;
  elsif new.is_active and not coalesce(old.is_active,false) then
    delete from eld_private.departures where driver_id=new.id;
    update public.eld_daily_checks set deleted_accounts=false
      where driver_id=new.id and work_date=(now() at time zone 'America/Chicago')::date;
  end if;
  return new;
end $$;
revoke all on function eld_private.track_departure() from public,anon,authenticated;
create trigger eld_track_departure after update of is_active on public.drivers
for each row when (old.is_active is distinct from new.is_active) execute function eld_private.track_departure();
-- Existing inactive drivers are not resurrected: their precise done time is unknown.

create or replace function eld_private.sync_today() returns void
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Chicago')::date;
begin
  -- Serialize roster refreshes with assignments so a waiting refresh cannot restore
  -- an assignee read before another transaction committed.
  perform pg_advisory_xact_lock(hashtextextended('eld_daily_roster',0));
  insert into public.eld_daily_checks(work_date,driver_id,driver_name,truck_number,worker_id,worker_name)
  select v_today,d.id,coalesce(nullif(d.name,''),nullif(btrim(concat_ws(' ',d.first_name,d.last_name)),''),'Unnamed driver'),
    case when d.is_active then coalesce(t.truck_number,'') else dep.truck_number end,a.worker_id,coalesce(p.full_name,p.email)
  from public.drivers d
  left join eld_private.departures dep on dep.driver_id=d.id
  left join public.eld_assignments a on a.driver_id=d.id
  left join public.profiles p on p.user_id=a.worker_id
  left join lateral (
    select tr.truck_number from public.trucks tr
    where tr.is_active and (tr.driver1_id=d.id or tr.driver2_id=d.id)
    order by tr.truck_number,tr.id limit 1
  ) t on true
  where (d.is_active and extract(isodow from v_today)<=5) or (dep.inactive_at > now()-interval '24 hours' and not dep.deleted_accounts)
  on conflict(work_date,driver_id) do update
    set driver_name=excluded.driver_name,truck_number=excluded.truck_number,
        worker_id=excluded.worker_id,worker_name=excluded.worker_name
  where (eld_daily_checks.driver_name,eld_daily_checks.truck_number,eld_daily_checks.worker_id,eld_daily_checks.worker_name)
    is distinct from (excluded.driver_name,excluded.truck_number,excluded.worker_id,excluded.worker_name);
end $$;

create or replace function eld_private.get_day(p_date date) returns jsonb
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
    'checks',coalesce((select jsonb_agg((to_jsonb(c) || jsonb_build_object('inactive_at',(select inactive_at from eld_private.departures where driver_id=c.driver_id))) order by c.truck_number,c.driver_name) from public.eld_daily_checks c
      where c.work_date=p_date and (v_manager or (v_worker and c.worker_id=auth.uid()))
      and (p_date<>v_today or exists(select 1 from public.drivers d where d.id=c.driver_id and (d.is_active or exists(select 1 from eld_private.departures dep where dep.driver_id=d.id and dep.inactive_at > now()-interval '24 hours' and not dep.deleted_accounts))))), '[]'::jsonb),
    'workers',coalesce((select jsonb_agg(jsonb_build_object('user_id',p.user_id,'name',coalesce(p.full_name,p.email)) order by coalesce(p.full_name,p.email))
      from public.profiles p where (v_manager or p.user_id=auth.uid()) and (p.is_eld or p.is_eld_manager)
      and exists(select 1 from public.user_roles r where r.user_id=p.user_id and r.role='maintenance')), '[]'::jsonb),
    'assignment_groups',case when v_manager and p_date=v_today then coalesce((
      select jsonb_agg(jsonb_build_object('scope',g.scope,'id',g.id,'name',g.name,'trucks',g.trucks,'drivers',g.drivers) order by g.scope,g.name)
      from (
        select s.scope,s.id,max(s.name) as name,count(distinct t.id) as trucks,count(distinct d.id) as drivers
        from public.trucks t
        join public.drivers d on d.is_active and (d.id=t.driver1_id or d.id=t.driver2_id)
        left join public.profiles p on p.user_id=t.dispatcher_id
        left join public.companies co on co.id=t.company_id
        cross join lateral (values ('dispatcher',t.dispatcher_id,coalesce(p.full_name,p.email,'Unknown dispatcher')),
          ('company',t.company_id,coalesce(co.name,'Unknown company'))) s(scope,id,name)
        where t.is_active and s.id is not null group by s.scope,s.id
      ) g
    ),'[]'::jsonb) else '[]'::jsonb end,
    'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at) from public.eld_side_tasks t
      where t.work_date=p_date and (v_manager or (v_worker and t.worker_id=auth.uid()))), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

create or replace function eld_private.save_check(p_id uuid,p_field text,p_value jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.eld_daily_checks; v_before jsonb; v_after jsonb;
  v_manager boolean := eld_private.is_manager();
begin
  if auth.uid() is null then raise exception 'ELD access denied' using errcode='42501'; end if;
  select * into c from public.eld_daily_checks where id=p_id for update;
  if not found or not (v_manager or (eld_private.is_worker() and c.worker_id=auth.uid() and c.work_date=(now() at time zone 'America/Chicago')::date)) then
    raise exception 'ELD update denied' using errcode='42501';
  end if;
  if c.work_date=(now() at time zone 'America/Chicago')::date and not exists(select 1 from public.drivers where id=c.driver_id and (is_active or exists(select 1 from eld_private.departures dep where dep.driver_id=c.driver_id and dep.inactive_at > now()-interval '24 hours' and not dep.deleted_accounts))) then
    raise exception 'This driver is no longer active';
  end if;
  if p_field not in ('yesterday_log','forms','pti','comment','deleted_accounts') or p_field is null then raise exception 'Invalid ELD field'; end if;
  if p_value is null or (p_field='comment' and jsonb_typeof(p_value)<>'string') or
     (p_field<>'comment' and jsonb_typeof(p_value)<>'boolean') then raise exception 'Invalid ELD value'; end if;
  if p_field='deleted_accounts' then
    if c.work_date<>(now() at time zone 'America/Chicago')::date or not exists (
      select 1 from eld_private.departures dep join public.drivers d on d.id=dep.driver_id
      where dep.driver_id=c.driver_id and not d.is_active and dep.inactive_at > now()-interval '24 hours'
    ) then raise exception 'Deleted accounts is only available for recently done drivers'; end if;
    update eld_private.departures set deleted_accounts=(p_value#>>'{}')::boolean where driver_id=c.driver_id;
  end if;
  v_before := jsonb_build_object(p_field,to_jsonb(c)->p_field);
  if v_before = jsonb_build_object(p_field,p_value) then return; end if;
  update public.eld_daily_checks set
    yesterday_log=case when p_field='yesterday_log' then (p_value#>>'{}')::boolean else yesterday_log end,
    forms=case when p_field='forms' then (p_value#>>'{}')::boolean else forms end,
    pti=case when p_field='pti' then (p_value#>>'{}')::boolean else pti end,
    deleted_accounts=case when p_field='deleted_accounts' then (p_value#>>'{}')::boolean else deleted_accounts end,
    comment=case when p_field='comment' then p_value#>>'{}' else comment end,
    updated_by=auth.uid(),updated_at=now() where id=p_id;
  v_after := jsonb_build_object(p_field,p_value,'driver_name',c.driver_name);
  insert into public.eld_activity(work_date,entity_type,entity_id,worker_id,actor_id,action,before_data,after_data)
    values(c.work_date,'check',p_id,c.worker_id,auth.uid(),'updated',v_before,v_after);
end $$;

create function eld_private.bulk_assign(p_scope text,p_group uuid,p_worker uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Chicago')::date;
begin
  if auth.uid() is null or not eld_private.is_manager() then
    raise exception 'ELD manager access required' using errcode='42501';
  end if;
  if p_scope is null or p_scope not in ('dispatcher','company') or p_group is null then
    raise exception 'Select a dispatcher or company';
  end if;
  if p_worker is null or not exists (
    select 1 from public.profiles p join public.user_roles r on r.user_id=p.user_id
    where p.user_id=p_worker and (p.is_eld or p.is_eld_manager) and r.role='maintenance'
  ) then raise exception 'Select a maintenance user with an ELD tag'; end if;
  perform pg_advisory_xact_lock(hashtextextended('eld_daily_roster',0));
  -- Lock matching drivers once; both team members receive the same ELD person.
  perform d.id from public.drivers d where d.is_active and exists (
    select 1 from public.trucks t where t.is_active and (t.driver1_id=d.id or t.driver2_id=d.id)
    and case when p_scope='dispatcher' then t.dispatcher_id=p_group else t.company_id=p_group end
  ) order by d.id for update;
  with targets as materialized (
    select d.id,d.name,a.worker_id as old_worker from public.drivers d
    left join public.eld_assignments a on a.driver_id=d.id
    where d.is_active and a.worker_id is distinct from p_worker and exists (
      select 1 from public.trucks t where t.is_active and (t.driver1_id=d.id or t.driver2_id=d.id)
      and case when p_scope='dispatcher' then t.dispatcher_id=p_group else t.company_id=p_group end
    )
  ), assigned as (
    insert into public.eld_assignments(driver_id,worker_id,updated_by)
    select id,p_worker,auth.uid() from targets
    on conflict(driver_id) do update set worker_id=excluded.worker_id,updated_by=excluded.updated_by,updated_at=now()
    returning driver_id
  )
  insert into public.eld_activity(work_date,entity_type,entity_id,worker_id,actor_id,action,before_data,after_data)
  select v_today,'assignment',t.id,p_worker,auth.uid(),'assigned',jsonb_build_object('worker_id',t.old_worker),
    jsonb_build_object('worker_id',p_worker,'driver_name',t.name,'scope',p_scope,'group_id',p_group)
  from targets t join assigned a on a.driver_id=t.id;
  perform eld_private.sync_today();
end $$;
revoke all on function eld_private.bulk_assign(text,uuid,uuid) from public,anon,authenticated;

create or replace function eld_private.manage(p_action text,p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_manager boolean := eld_private.is_manager(); v_today date := (now() at time zone 'America/Chicago')::date;
  v_driver uuid; v_worker uuid; v_old_worker uuid; v_id uuid; v_date date; t public.eld_side_tasks; v_completed boolean;
begin
  if auth.uid() is null then raise exception 'ELD access denied' using errcode='42501'; end if;
  if p_action='bulk_assign' then
    perform eld_private.bulk_assign(p_payload->>'scope',(p_payload->>'group_id')::uuid,(p_payload->>'worker_id')::uuid);
    return;
  end if;
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

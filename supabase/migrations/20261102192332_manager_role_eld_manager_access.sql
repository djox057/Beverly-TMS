-- The manager role has the same ELD capabilities as a tagged maintenance manager.
create or replace function eld_private.is_manager() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and (
    public.has_role(auth.uid(),'admin') or
    public.has_role(auth.uid(),'manager') or
    (public.has_role(auth.uid(),'maintenance') and exists (
      select 1 from public.profiles where user_id=auth.uid() and is_eld_manager
    ))
  );
$$;

CREATE OR REPLACE FUNCTION eld_private.get_day(p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  v_manager boolean := eld_private.is_manager();
  v_worker boolean := eld_private.is_worker();
  v_result jsonb;
begin
  if auth.uid() is null or not (v_manager or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'maintenance')) then
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
end $function$

;

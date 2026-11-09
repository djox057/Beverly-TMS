-- Recover only evidence-backed former offices. Historical source rows, including
-- March, remain untouched. Known installation-time office mappings stay frozen.
alter table turnover_private.legacy_dispatchers
 add column office_source text not null default 'setup_profile',
 add column last_known_office text,
 add column deleted_at timestamptz;

create function turnover_private.normalize_office(p_office text) returns text
language sql immutable security invoker set search_path='' as $$
 select case upper(trim(p_office))
  when 'CACAK' then 'Čačak' when 'ČAČAK' then 'Čačak'
  when 'KRAGUJEVAC' then 'KRAGUJEVAC'
  when 'BG 1ST FLOOR' then 'BG 1st floor'
  when 'BG 4TH FLOOR' then 'BG 4th floor'
  when 'BG 2ND FLOOR' then 'BG 4th floor'
  when 'RECOVERY' then 'Recovery'
  else null end;
$$;
revoke all on function turnover_private.normalize_office(text) from public,anon,authenticated;

-- Keep aliases tied to stable IDs. Never infer an office from a nickname, driver
-- company, or supervisor. An exact normalized full name must identify one ID,
-- and all preserved report evidence must agree on one canonical office.
with ids as (
 select distinct dispatcher_id from public.dispatcher_daily_driver_counts where date>=date '2026-04-01'
 union select dispatcher_id from turnover_private.events
), names as (
 select user_id as dispatcher_id,full_name as name,100 as priority from public.profiles
 union all select dispatcher_id,dispatcher_name,90 from turnover_private.legacy_dispatchers
 union all select dispatcher_id,dispatcher_name,80 from turnover_private.events
 union all select last_dispatcher_id,last_dispatcher_name,70 from public.drivers
 union all select dispatcher_id,dispatcher_name_snapshot,60 from public.assignment_history
 union all select old_dispatcher_id,old_dispatcher_name_snapshot,60 from public.assignment_history
 union all select dispatcher_id,dispatcher_name,50 from public.dispatcher_off_duty_days
), valid_names as (
 select dispatcher_id,trim(name) as name,priority,
  lower(regexp_replace(trim(name),'[[:space:]]+',' ','g')) as name_key
 from names where dispatcher_id is not null and nullif(trim(name),'') is not null
 and trim(name) not in ('Unknown','Former / unknown','Unassigned')
), unique_names as (
 select name_key,min(dispatcher_id::text)::uuid as dispatcher_id
 from valid_names group by name_key having count(distinct dispatcher_id)=1
), evidence as (
 select n.dispatcher_id,turnover_private.normalize_office(r.office) as office
 from unique_names n join public.daily_report_entries r
 on lower(regexp_replace(trim(r.dispatcher_name),'[[:space:]]+',' ','g'))=n.name_key
 where r.date>=date '2026-04-01'
), recovered as (
 select dispatcher_id,min(office) as office from evidence
 where office is not null group by dispatcher_id having count(distinct office)=1
), labels as (
 select distinct on(dispatcher_id) dispatcher_id,name from valid_names
 order by dispatcher_id,priority desc,name
)
insert into turnover_private.legacy_dispatchers(dispatcher_id,dispatcher_name,office,office_source)
 select i.dispatcher_id,coalesce(l.name,'Former / unknown'),coalesce(r.office,'Unknown'),
 case when r.office is not null then 'historical_report' else 'unavailable' end
 from ids i left join labels l using(dispatcher_id) left join recovered r using(dispatcher_id)
 where i.dispatcher_id is not null
on conflict(dispatcher_id) do update set
 dispatcher_name=case when legacy_dispatchers.dispatcher_name in ('Unknown','Former / unknown','Unassigned') then excluded.dispatcher_name else legacy_dispatchers.dispatcher_name end,
 office=excluded.office,office_source=excluded.office_source
 where legacy_dispatchers.office='Unknown' and excluded.office<>'Unknown';

-- Amend only estimated copies, never the source drivers/counts or captured events.
update turnover_private.events e set office=l.office,office_estimated=true
 from turnover_private.legacy_dispatchers l
 where e.dispatcher_id=l.dispatcher_id and e.source='legacy'
 and e.occurred_on>=date '2026-04-01' and e.office='Unknown' and l.office<>'Unknown';

-- This fires for every deletion path, including cascades from auth.users.
create function turnover_private.preserve_dispatcher_office() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into turnover_private.legacy_dispatchers(dispatcher_id,dispatcher_name,office,office_source,last_known_office,deleted_at)
 values(old.user_id,coalesce(nullif(trim(old.full_name),''),'Former / unknown'),coalesce(old.office::text,'Unknown'),
 'profile_before_delete',old.office::text,now())
 on conflict(dispatcher_id) do update set
  last_known_office=excluded.last_known_office,deleted_at=excluded.deleted_at,
  office=case when legacy_dispatchers.office='Unknown' then excluded.office else legacy_dispatchers.office end,
  office_source=case when legacy_dispatchers.office='Unknown' then excluded.office_source else legacy_dispatchers.office_source end;
 return old;
end $$;
revoke all on function turnover_private.preserve_dispatcher_office() from public,anon,authenticated;
create trigger turnover_preserve_dispatcher_office before delete on public.profiles
 for each row execute function turnover_private.preserve_dispatcher_office();

create function turnover_private.get_turnover_dispatcher_directory() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform turnover_private.assert_access();
 return coalesce((select jsonb_agg(jsonb_build_object('dispatcher_id',dispatcher_id,
  'dispatcher_name',dispatcher_name,'office',office,'office_source',office_source)
  order by dispatcher_name) from turnover_private.legacy_dispatchers),'[]'::jsonb);
end $$;
revoke all on function turnover_private.get_turnover_dispatcher_directory() from public,anon;
grant execute on function turnover_private.get_turnover_dispatcher_directory() to authenticated,service_role;
create function public.get_turnover_dispatcher_directory() returns jsonb
language sql security invoker set search_path='' as $$
 select turnover_private.get_turnover_dispatcher_directory();
$$;
revoke all on function public.get_turnover_dispatcher_directory() from public,anon;
grant execute on function public.get_turnover_dispatcher_directory() to authenticated,service_role;
notify pgrst,'reload schema';

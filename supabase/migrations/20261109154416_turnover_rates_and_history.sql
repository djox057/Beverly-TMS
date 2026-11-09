-- March 2026 and all earlier source records remain unchanged.
-- Only new tables receive historical copies, bounded to April 1 onward.
create schema turnover_private;
revoke all on schema turnover_private from public,anon,authenticated;
grant usage on schema turnover_private to service_role;
create table turnover_private.settings (
 singleton boolean primary key default true check(singleton),
 started_at timestamptz not null default now(),
 historical_from date not null default date '2026-04-01'
);
insert into turnover_private.settings(singleton) values(true);
-- Freeze the setup-time office inference so later profile moves do not rewrite old rates.
create table turnover_private.legacy_dispatchers (
 dispatcher_id uuid primary key,dispatcher_name text not null,office text not null
);
insert into turnover_private.legacy_dispatchers(dispatcher_id,dispatcher_name,office)
 select user_id,coalesce(full_name,email,'Unknown'),coalesce(office::text,'Unknown') from public.profiles;
create table turnover_private.events (
 id uuid primary key default gen_random_uuid(),
 driver_id uuid not null, driver_name text not null,
 dispatcher_id uuid, dispatcher_name text not null, office text not null,
 company_id uuid, company_name text,
 event_type text not null check(event_type in ('departure','reactivation')),
 occurred_on date not null, occurred_at timestamptz not null,
 recorded_at timestamptz not null default now(),
 counts_as_turnover boolean not null,
 reason text,
 source text not null check(source in ('captured','legacy')),
 office_estimated boolean not null default false,
 check(occurred_on >= date '2026-04-01')
);
create index turnover_events_date_idx on turnover_private.events(occurred_on,event_type);
create index turnover_events_dispatcher_idx on turnover_private.events(dispatcher_id,occurred_on);
create index turnover_events_office_idx on turnover_private.events(office,occurred_on);
create index turnover_events_driver_idx on turnover_private.events(driver_id,occurred_at);
create table turnover_private.daily_roster (
 snapshot_date date not null,driver_id uuid not null,
 dispatcher_id uuid,dispatcher_name text not null,office text not null,
 company_id uuid,
 primary key(snapshot_date,driver_id)
);
create index turnover_roster_dispatcher_idx on turnover_private.daily_roster(dispatcher_id,snapshot_date);
create table turnover_private.snapshot_runs (
 snapshot_date date primary key,recorded_at timestamptz not null default now(),
 driver_count integer not null check(driver_count>=0),complete boolean not null
);
-- No auth/user/driver foreign keys: history must survive account/driver deletion.
alter table turnover_private.settings enable row level security;
alter table turnover_private.legacy_dispatchers enable row level security;
alter table turnover_private.events enable row level security;
alter table turnover_private.daily_roster enable row level security;
alter table turnover_private.snapshot_runs enable row level security;
create policy "Service manages turnover legacy offices" on turnover_private.legacy_dispatchers for all to service_role using(true) with check(true);
create policy "Service manages turnover settings" on turnover_private.settings for all to service_role using(true) with check(true);
create policy "Service manages turnover events" on turnover_private.events for all to service_role using(true) with check(true);
create policy "Service manages turnover roster" on turnover_private.daily_roster for all to service_role using(true) with check(true);
create policy "Service manages turnover snapshot runs" on turnover_private.snapshot_runs for all to service_role using(true) with check(true);
revoke all on all tables in schema turnover_private from public,anon,authenticated;
grant all on all tables in schema turnover_private to service_role;

-- Preserve currently known April+ departures. No changes/backfill to drivers,
-- assignments, daily counts, termination notes, or any March record.
insert into turnover_private.events(driver_id,driver_name,dispatcher_id,dispatcher_name,office,company_id,company_name,event_type,occurred_on,occurred_at,counts_as_turnover,reason,source,office_estimated)
select d.id,coalesce(nullif(d.name,''),concat_ws(' ',d.first_name,d.last_name),'Unknown'),
 d.last_dispatcher_id,coalesce(nullif(d.last_dispatcher_name,''),p.full_name,'Unassigned'),
 coalesce(p.office::text,'Unknown'),d.company_id,coalesce(c.name,d.company_name),
 'departure',d.termination_date,d.termination_date::timestamp at time zone 'America/Chicago',
 coalesce(d.counts_as_turnover,true),
 (select string_agg(n.note,E'\n' order by n.created_at) from public.driver_termination_notes n where n.driver_id=d.id),
 'legacy',true
from public.drivers d left join public.profiles p on p.user_id=d.last_dispatcher_id
left join public.companies c on c.id=d.company_id
where not d.is_active and d.termination_date>=date '2026-04-01'
 and d.termination_date<=(now() at time zone 'America/Chicago')::date;

create function turnover_private.capture_status_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_dispatcher uuid;v_name text;v_office text;v_company uuid;v_company_name text;v_day date;
begin
 if old.is_active is not distinct from new.is_active then return new; end if;
 v_day := (now() at time zone 'America/Chicago')::date;
 if v_day<date '2026-04-01' then return new; end if;
 if old.is_active and not new.is_active then
   v_dispatcher:=coalesce(old.dispatcher_id,new.last_dispatcher_id,old.last_dispatcher_id);
   v_company:=old.company_id;
 else
   v_dispatcher:=coalesce(new.dispatcher_id,old.last_dispatcher_id,old.dispatcher_id);
   v_company:=new.company_id;
 end if;
 select p.full_name,p.office::text into v_name,v_office from public.profiles p where p.user_id=v_dispatcher;
 select c.name into v_company_name from public.companies c where c.id=v_company;
 insert into turnover_private.events(driver_id,driver_name,dispatcher_id,dispatcher_name,office,company_id,company_name,event_type,occurred_on,occurred_at,counts_as_turnover,reason,source)
 values(new.id,coalesce(nullif(new.name,''),nullif(concat_ws(' ',new.first_name,new.last_name),''),'Unknown'),
 v_dispatcher,coalesce(v_name,old.last_dispatcher_name,'Unassigned'),coalesce(v_office,'Unknown'),v_company,coalesce(v_company_name,new.company_name),
 case when new.is_active then 'reactivation' else 'departure' end,v_day,now(),
 case when new.is_active then false else coalesce(new.counts_as_turnover,true) end,
 case when not new.is_active then (select string_agg(n.note,E'\n' order by n.created_at) from public.driver_termination_notes n where n.driver_id=new.id) else null end,'captured');
 return new;
end $$;
revoke all on function turnover_private.capture_status_event() from public,anon,authenticated;
create trigger turnover_capture_status after update of is_active on public.drivers
for each row when(old.is_active is distinct from new.is_active) execute function turnover_private.capture_status_event();

-- Chicago 23:55 independent of daylight saving. Hourly no-op checks are cheap;
-- only the matching local hour creates an atomic complete snapshot.
create function turnover_private.capture_daily_snapshot(p_force boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_now timestamp := now() at time zone 'America/Chicago';v_day date;v_final boolean;v_count integer;
begin
 v_day:=v_now::date;v_final:=extract(hour from v_now)=23;
 if not p_force and not v_final then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('turnover-snapshot-'||v_day::text,0));
 if exists(select 1 from turnover_private.snapshot_runs where snapshot_date=v_day and complete) then return false; end if;
 delete from turnover_private.daily_roster where snapshot_date=v_day;
 insert into turnover_private.daily_roster(snapshot_date,driver_id,dispatcher_id,dispatcher_name,office,company_id)
 select v_day,d.id,d.dispatcher_id,coalesce(p.full_name,'Unassigned'),coalesce(p.office::text,'Unknown'),d.company_id
 from public.drivers d left join public.profiles p on p.user_id=d.dispatcher_id where d.is_active;
 get diagnostics v_count=row_count;
 insert into turnover_private.snapshot_runs(snapshot_date,recorded_at,driver_count,complete)
 values(v_day,now(),v_count,v_final)
 on conflict(snapshot_date) do update set recorded_at=excluded.recorded_at,driver_count=excluded.driver_count,complete=excluded.complete;
 return true;
end $$;
revoke all on function turnover_private.capture_daily_snapshot(boolean) from public,anon,authenticated;
grant execute on function turnover_private.capture_daily_snapshot(boolean) to service_role;
select turnover_private.capture_daily_snapshot(true);
select cron.schedule('turnover-daily-roster','55 * * * *','select turnover_private.capture_daily_snapshot();');

create function turnover_private.assert_access() returns void
language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'role','')='service_role' then return; end if;
 if auth.uid() is null or not public.has_role(auth.uid(),'admin'::public.app_role) then
   raise exception 'Turnover analytics requires admin access' using errcode='42501';
 end if;
end $$;
revoke all on function turnover_private.assert_access() from public,anon,authenticated;

create function public.get_turnover_metrics(p_start date,p_end date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_start date;v_end date;v_today date:=(now() at time zone 'America/Chicago')::date;v_cutover date;v_started timestamptz;v_result jsonb;
begin
 perform turnover_private.assert_access();
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>365 then raise exception 'Select a valid period of at most 366 days'; end if;
 select started_at,(started_at at time zone 'America/Chicago')::date into v_started,v_cutover from turnover_private.settings where singleton;
 v_start:=greatest(p_start,date '2026-04-01');v_end:=least(p_end,v_today);
 if v_end<v_start then return jsonb_build_object('start',v_start,'end',v_end,'available',false,'historical_from','2026-04-01','tracking_started',v_started,'groups','[]'::jsonb,'months','[]'::jsonb,'dispatchers','[]'::jsonb,'missing_dates','[]'::jsonb); end if;
 with calendar as (
  select g::date as day from generate_series(v_start::timestamp,v_end::timestamp,interval '1 day') g
 ), covered as (
  select distinct x.date as day from public.dispatcher_daily_driver_counts x where x.date between v_start and v_end and x.date<v_cutover
  union select r.snapshot_date from turnover_private.snapshot_runs r where r.snapshot_date between v_start and v_end and r.snapshot_date>=v_cutover and r.snapshot_date<v_today and r.complete
  union select v_today where v_today between v_start and v_end
 ), months as (
  select date_trunc('month',c.day)::date as month_start,count(*)::int as expected_days,count(d.day)::int as observed_days,
   count(*) filter(where c.day<v_cutover)::int as legacy_days,
   bool_or(c.day=v_today) as partial_today
  from calendar c left join covered d on d.day=c.day group by 1
 ), counts as (
  select x.date as day,x.dispatcher_id,coalesce(p.dispatcher_name,'Former / unknown') as dispatcher_name,coalesce(p.office,'Unknown') as office,x.driver_count::bigint as driver_count,true as estimated
  from public.dispatcher_daily_driver_counts x left join turnover_private.legacy_dispatchers p on p.dispatcher_id=x.dispatcher_id
  where x.date between v_start and v_end and x.date<v_cutover
  union all
  select r.snapshot_date,r.dispatcher_id,r.dispatcher_name,r.office,count(*)::bigint,false
  from turnover_private.daily_roster r join turnover_private.snapshot_runs s on s.snapshot_date=r.snapshot_date and s.complete
  where r.snapshot_date between v_start and v_end and r.snapshot_date>=v_cutover and r.snapshot_date<v_today
  group by r.snapshot_date,r.dispatcher_id,r.dispatcher_name,r.office
  union all
  select v_today,d.dispatcher_id,coalesce(p.full_name,'Unassigned'),coalesce(p.office::text,'Unknown'),count(*)::bigint,false
  from public.drivers d left join public.profiles p on p.user_id=d.dispatcher_id
  where d.is_active and v_today between v_start and v_end
  group by d.dispatcher_id,p.full_name,p.office
 ), active as (
  select date_trunc('month',day)::date as month_start,dispatcher_id,office,max(dispatcher_name) as dispatcher_name,sum(driver_count) as driver_days,bool_or(estimated) as estimated
  from counts group by 1,2,3
 ), departures as (
  select date_trunc('month',e.occurred_on)::date as month_start,e.dispatcher_id,e.office,max(e.dispatcher_name) as dispatcher_name,
   count(*) filter(where e.event_type='departure' and e.counts_as_turnover)::int as departures,
   count(*) filter(where e.event_type='departure' and not e.counts_as_turnover)::int as excluded,
   count(*) filter(where e.event_type='reactivation')::int as reactivations,
   bool_or(e.office_estimated or e.source='legacy') as estimated
  from turnover_private.events e where e.occurred_on between v_start and v_end group by 1,2,3
 ), groups as (
  select coalesce(a.month_start,e.month_start) as month_start,coalesce(a.dispatcher_id,e.dispatcher_id) as dispatcher_id,
   coalesce(e.dispatcher_name,a.dispatcher_name,'Unassigned') as dispatcher_name,coalesce(a.office,e.office,'Unknown') as office,
   coalesce(a.driver_days,0) as driver_days,coalesce(e.departures,0) as departures,coalesce(e.excluded,0) as excluded,coalesce(e.reactivations,0) as reactivations,
   coalesce(a.estimated,false) or coalesce(e.estimated,false) as estimated
  from active a full join departures e on a.month_start=e.month_start and coalesce(a.dispatcher_id::text,'')=coalesce(e.dispatcher_id::text,'') and a.office=e.office
 ), directory as (
  select distinct p.user_id as dispatcher_id,coalesce(p.full_name,p.email) as dispatcher_name,coalesce(p.office::text,'Unknown') as office
  from public.profiles p join public.user_roles r on r.user_id=p.user_id where r.role in ('dispatch','afterhours','supervisor')
 )
 select jsonb_build_object('available',true,'start',v_start,'end',v_end,'historical_from','2026-04-01','tracking_started',v_started,
 'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.month_start,g.office,g.dispatcher_name) from groups g),'[]'::jsonb),
 'months',coalesce((select jsonb_agg(to_jsonb(m) order by m.month_start) from months m),'[]'::jsonb),
 'dispatchers',coalesce((select jsonb_agg(to_jsonb(d) order by d.dispatcher_name) from directory d),'[]'::jsonb),
 'missing_dates',coalesce((select jsonb_agg(c.day order by c.day) from calendar c where not exists(select 1 from covered d where d.day=c.day)),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
revoke all on function public.get_turnover_metrics(date,date) from public,anon;
grant execute on function public.get_turnover_metrics(date,date) to authenticated,service_role;

create function public.get_turnover_events(p_start date,p_end date,p_office text default null,p_dispatcher uuid default null,p_unassigned boolean default false,p_offset integer default 0,p_limit integer default 50,p_include_excluded boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform turnover_private.assert_access();
 if p_start is null or p_end is null or p_end<p_start or p_end-p_start>365 or p_offset<0 or p_limit not between 1 and 100 then raise exception 'Invalid turnover detail request'; end if;
 with filtered as (
  select e.id,e.driver_id,e.driver_name,e.dispatcher_id,e.dispatcher_name,e.office,e.occurred_on,e.counts_as_turnover,e.reason,e.source,e.office_estimated,
   exists(select 1 from public.drivers d where d.id=e.driver_id) as driver_exists
  from turnover_private.events e
  where e.event_type='departure' and e.occurred_on between greatest(p_start,date '2026-04-01') and p_end
   and (p_office is null or e.office=p_office)
   and (not p_unassigned or e.dispatcher_id is null)
   and (p_dispatcher is null or e.dispatcher_id=p_dispatcher)
   and (p_include_excluded or e.counts_as_turnover)
 ), page as (select * from filtered order by occurred_on desc,id limit p_limit offset p_offset)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(p) order by p.occurred_on desc,p.id) from page p),'[]'::jsonb)) into v_result;
 return v_result;
end $$;
revoke all on function public.get_turnover_events(date,date,text,uuid,boolean,integer,integer,boolean) from public,anon;
grant execute on function public.get_turnover_events(date,date,text,uuid,boolean,integer,integer,boolean) to authenticated,service_role;

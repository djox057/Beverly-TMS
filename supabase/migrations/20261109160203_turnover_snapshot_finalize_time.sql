-- A forced setup snapshot before Chicago 23:55 stays provisional.
create or replace function turnover_private.capture_daily_snapshot(p_force boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_now timestamp := now() at time zone 'America/Chicago';v_day date;v_final boolean;v_count integer;
begin
 v_day:=v_now::date;v_final:=extract(hour from v_now)=23 and extract(minute from v_now)>=55;
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

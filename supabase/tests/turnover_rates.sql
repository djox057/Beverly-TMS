-- Transactional regression checks. Only a temporary driver table is updated;
-- existing driver rows, email triggers and March data are never modified.
begin;
set local request.jwt.claims = '{"role":"service_role"}';
create temporary table turnover_driver_fixture (
 id uuid,name text,first_name text,last_name text,is_active boolean,
 dispatcher_id uuid,last_dispatcher_id uuid,last_dispatcher_name text,
 company_id uuid,company_name text,counts_as_turnover boolean
) on commit drop;
create trigger fixture_capture after update of is_active on turnover_driver_fixture
for each row when(old.is_active is distinct from new.is_active) execute function turnover_private.capture_status_event();
do $$
declare v_driver uuid:=gen_random_uuid();v_dispatcher uuid:=gen_random_uuid();v_bad_user uuid:=gen_random_uuid();v_data jsonb;v_group jsonb;v_today date:=(now() at time zone 'America/Chicago')::date;v_denied boolean:=false;v_march text;v_after text;
begin
 select md5(coalesce(string_agg(id::text||date::text||driver_count::text,',' order by id),'')) into v_march from public.dispatcher_daily_driver_counts where date>=date '2026-03-01' and date<date '2026-04-01';
 if exists(select 1 from turnover_private.events where occurred_on<date '2026-04-01') then raise exception 'March copied into turnover events'; end if;
 v_data:=public.get_turnover_metrics('2026-03-01','2026-03-31');
 if (v_data->>'available')::boolean then raise exception 'March must remain on the existing list'; end if;
 if has_function_privilege('anon','public.get_turnover_metrics(date,date)','execute') then raise exception 'Anonymous RPC access'; end if;
 if has_table_privilege('authenticated','turnover_private.events','select') or has_table_privilege('authenticated','turnover_private.daily_roster','select') then raise exception 'Private tables exposed'; end if;
 insert into turnover_driver_fixture values(v_driver,'Turnover test',null,null,true,v_dispatcher,null,null,null,null,false);
 update turnover_driver_fixture set dispatcher_id=v_dispatcher where id=v_driver;
 if exists(select 1 from turnover_private.events where driver_id=v_driver) then raise exception 'Assignment counted as turnover'; end if;
 update turnover_driver_fixture set is_active=false,last_dispatcher_id=v_dispatcher,dispatcher_id=null where id=v_driver;
 update turnover_driver_fixture set is_active=false where id=v_driver;
 if (select count(*) from turnover_private.events where driver_id=v_driver)<>1 then raise exception 'Duplicate departure capture'; end if;
 if not exists(select 1 from turnover_private.events where driver_id=v_driver and dispatcher_id=v_dispatcher and not counts_as_turnover and source='captured' and occurred_on=v_today) then raise exception 'Departure attribution/flag incorrect'; end if;
 update turnover_driver_fixture set is_active=true,dispatcher_id=v_dispatcher where id=v_driver;
 if (select count(*) from turnover_private.events where driver_id=v_driver and event_type='departure')<>1 then raise exception 'Resume removed departure'; end if;
 update turnover_driver_fixture set is_active=false,counts_as_turnover=true where id=v_driver;
 delete from turnover_driver_fixture where id=v_driver;
 if (select count(*) from turnover_private.events where driver_id=v_driver)<>3 then raise exception 'Driver deletion lost history'; end if;
 v_data:=public.get_turnover_metrics(v_today,v_today);
 select item into v_group from jsonb_array_elements(v_data->'groups') item where item->>'dispatcher_id'=v_dispatcher::text;
 if v_group is null or (v_group->>'departures')::integer<>1 or (v_group->>'excluded')::integer<>1 or (v_group->>'reactivations')::integer<>1 then raise exception 'Counts/flags incorrect: %',v_group; end if;
 v_data:=public.get_turnover_events(v_today,v_today,null,v_dispatcher,false,0,1,true);
 if (v_data->>'total')::integer<>2 or jsonb_array_length(v_data->'items')<>1 then raise exception 'Pagination/counts mismatch'; end if;
 v_data:=public.get_turnover_events(v_today,v_today,null,v_dispatcher,false,0,50,false);
 if (v_data->>'total')::integer<>1 then raise exception 'Excluded departure in rate numerator'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',v_bad_user,'user_metadata',jsonb_build_object('role','admin'))::text,true);
 begin
  perform public.get_turnover_metrics(v_today,v_today);
 exception when insufficient_privilege then v_denied:=true;
 end;
 if not v_denied then raise exception 'Non-admin or user_metadata role bypass'; end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 select md5(coalesce(string_agg(id::text||date::text||driver_count::text,',' order by id),'')) into v_after from public.dispatcher_daily_driver_counts where date>=date '2026-03-01' and date<date '2026-04-01';
 if v_after is distinct from v_march then raise exception 'March source counts changed'; end if;
end $$;
rollback;

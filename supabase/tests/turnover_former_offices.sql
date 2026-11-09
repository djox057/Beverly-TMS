-- Transactional checks: only a temporary profile fixture is deleted; no real
-- profiles, users, driver data, or existing March records are changed.
begin;
set local request.jwt.claims = '{"role":"service_role"}';
create temporary table turnover_profile_fixture (
 user_id uuid, full_name text, office text
) on commit drop;
create trigger fixture_preserve before delete on turnover_profile_fixture
 for each row execute function turnover_private.preserve_dispatcher_office();
create temporary table turnover_driver_fixture (
 id uuid,name text,first_name text,last_name text,is_active boolean,
 dispatcher_id uuid,last_dispatcher_id uuid,last_dispatcher_name text,
 company_id uuid,company_name text,counts_as_turnover boolean
) on commit drop;
create trigger fixture_status after update of is_active on turnover_driver_fixture
 for each row when(old.is_active is distinct from new.is_active)
 execute function turnover_private.capture_status_event();
do $$
declare v_user uuid:=gen_random_uuid(); v_known uuid:=gen_random_uuid(); v_driver uuid:=gen_random_uuid(); v_result jsonb;
begin
 if turnover_private.normalize_office('CACAK') is distinct from 'Čačak'
 or turnover_private.normalize_office('BG 1st FLOOR') is distinct from 'BG 1st floor'
 or turnover_private.normalize_office('Unknown') is not null then
  raise exception 'Office normalization failed';
 end if;
 insert into turnover_profile_fixture values(v_user,'Former fixture','Čačak');
 delete from turnover_profile_fixture where user_id=v_user;
 if not exists(select 1 from turnover_private.legacy_dispatchers where dispatcher_id=v_user
  and office='Čačak' and dispatcher_name='Former fixture' and deleted_at is not null) then
  raise exception 'Deleting a profile lost its office';
 end if;
 insert into turnover_private.legacy_dispatchers(dispatcher_id,dispatcher_name,office)
 values(v_known,'Frozen fixture','Čačak');
 insert into turnover_profile_fixture values(v_known,'Frozen fixture','KRAGUJEVAC');
 delete from turnover_profile_fixture where user_id=v_known;
 if not exists(select 1 from turnover_private.legacy_dispatchers where dispatcher_id=v_known
  and office='Čačak' and last_known_office='KRAGUJEVAC' and deleted_at is not null) then
  raise exception 'Deletion rewrote the frozen historical mapping';
 end if;
 insert into turnover_driver_fixture values(v_driver,'Fixture driver',null,null,true,v_known,v_known,'Frozen fixture',null,null,true);
 update turnover_driver_fixture set is_active=false,dispatcher_id=null where id=v_driver;
 if not exists(select 1 from turnover_private.events where driver_id=v_driver
  and dispatcher_id=v_known and office='KRAGUJEVAC' and not office_estimated) then
  raise exception 'Future departure lost the deleted dispatcher last-known office';
 end if;
 v_result:=public.get_turnover_dispatcher_directory();
 if not exists(select 1 from jsonb_array_elements(v_result) d where d->>'dispatcher_id'=v_user::text and d->>'office'='Čačak') then
  raise exception 'Directory RPC omitted a former dispatcher office';
 end if;
 if has_function_privilege('anon','public.get_turnover_dispatcher_directory()','execute')
 or has_table_privilege('authenticated','turnover_private.legacy_dispatchers','select') then
  raise exception 'Directory access boundary changed';
 end if;
end $$;
rollback;

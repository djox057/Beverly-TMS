-- Verify with existing role/assignment records; all test writes are rolled back.
begin;
create temporary table holiday_permission_actors (id uuid, role text, truck text);
do $$
declare actor record; actor_role text; unit text;
begin
 for actor in select distinct user_id from public.user_roles order by user_id loop
  perform set_config('request.jwt.claim.sub', actor.user_id::text, true);
  actor_role := public.holiday_actor_role();
  if actor_role in ('admin','manager','supervisor','dispatch','accounting') and not exists(select 1 from holiday_permission_actors where role=actor_role) then
   select t into unit from public.holiday_allowed_trucks() t limit 1;
   if unit is not null then insert into holiday_permission_actors values(actor.user_id,actor_role,unit); end if;
  end if;
 end loop;
 if (select count(*) from holiday_permission_actors) <> 5 then raise exception 'Missing role fixtures'; end if;
end $$;
create temporary table holiday_permission_counts as select count(*) total from public.holiday_report_entries;
grant select on holiday_permission_actors, holiday_permission_counts to authenticated;
set local role authenticated;
do $$
declare actor record; row_id uuid; affected integer; denied boolean;
begin
 for actor in select * from holiday_permission_actors loop
  perform set_config('request.jwt.claim.sub',actor.id::text,true);
  if actor.role='accounting' then
   if (select count(*) from public.holiday_report_entries where note <> 'holiday-permission-test') <> (select total from holiday_permission_counts) then raise exception 'Accounting cannot read every row'; end if;
   denied := false;
   begin
    insert into public.holiday_report_entries(year,holiday_slug,truck,note) values(2099,'christmas',actor.truck,'holiday-permission-test');
   exception when insufficient_privilege then denied := true; end;
   if not denied then raise exception 'Accounting can insert'; end if;
   denied := false;
   begin update public.holiday_report_entries set note='forbidden-accounting-note' where truck=actor.truck;
   exception when insufficient_privilege then denied := true; end;
   if not denied then raise exception 'Accounting can edit notes'; end if;
   delete from public.holiday_report_entries where truck=actor.truck;
   get diagnostics affected=row_count;
   if affected<>0 then raise exception 'Accounting can delete'; end if;
  else
   insert into public.holiday_report_entries(year,holiday_slug,truck,note) values(2099,'christmas',actor.truck,'holiday-permission-test') returning id into row_id;
   update public.holiday_report_entries set note='holiday-permission-test' where id=row_id;
   if actor.role in ('admin','manager') then
    update public.holiday_report_entries set bonus=true where id=row_id;
    if not (select bonus from public.holiday_report_entries where id=row_id) then raise exception 'Bonus save failed'; end if;
    update public.holiday_report_entries set bonus=false where id=row_id;
   else
    denied := false;
    begin update public.holiday_report_entries set bonus=true where id=row_id;
    exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'Unauthorized bonus update for %',actor.role; end if;
    denied := false;
    begin insert into public.holiday_report_entries(year,holiday_slug,truck,bonus) values(2099,'christmas',actor.truck,true);
    exception when insufficient_privilege then denied := true; end;
    if not denied then raise exception 'Unauthorized bonus insert for %',actor.role; end if;
   end if;
  end if;
 end loop;
end $$;
reset role;
select 'Passed: Accounting read access with protected notes; admin/manager Bonus edits; dispatch/supervisor Bonus denied' result;
rollback;

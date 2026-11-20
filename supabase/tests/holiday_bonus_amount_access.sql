begin;
create temporary table holiday_amount_actors(id uuid, role text, truck text, row_id uuid);
create temporary table holiday_bonus_outside_scope(role text, row_id uuid);
do $$
declare actor record; actor_role text; unit text; entry_id uuid;
begin
 for actor in select distinct user_id from public.user_roles loop
  perform set_config('request.jwt.claim.sub', actor.user_id::text, true);
  actor_role := public.holiday_actor_role();
  if actor_role in ('admin','manager','accounting','supervisor','dispatch') and not exists(select 1 from holiday_amount_actors where role=actor_role) then
   select t into unit from public.holiday_allowed_trucks() t limit 1;
   if unit is not null then
    insert into public.holiday_report_entries(year,holiday_slug,truck,bonus,bonus_amount) values(2099,'christmas',unit,true,100) returning id into entry_id;
    insert into holiday_amount_actors values(actor.user_id,actor_role,unit,entry_id);
   end if;
  end if;
 end loop;
 if (select count(*) from holiday_amount_actors)<>5 then raise exception 'Missing role fixtures'; end if;
 for actor in select * from holiday_amount_actors where role in ('dispatch','supervisor') loop
  perform set_config('request.jwt.claim.sub',actor.id::text,true);
  select t.truck_number into unit from public.trucks t
  where t.is_active and t.truck_number not in (select public.holiday_allowed_trucks()) limit 1;
  if unit is null then raise exception 'Missing truck outside scope for %',actor.role; end if;
  insert into public.holiday_report_entries(year,holiday_slug,truck,bonus,bonus_amount)
  values(2099,'christmas',unit,true,100) returning id into entry_id;
  insert into holiday_bonus_outside_scope values(actor.role,entry_id);
 end loop;
end $$;
grant select on holiday_amount_actors, holiday_bonus_outside_scope to authenticated;
set local role authenticated;
do $$
declare actor record; denied boolean; affected integer;
begin
 for actor in select * from holiday_amount_actors loop
  perform set_config('request.jwt.claim.sub',actor.id::text,true);
  update public.holiday_report_entries set bonus_amount=125.50 where id=actor.row_id;
  if (select bonus_amount from public.holiday_report_entries where id=actor.row_id) is distinct from 125.50 then
   raise exception 'Amount edit failed for %',actor.role;
  end if;
  if actor.role in ('dispatch','supervisor') then
   update public.holiday_report_entries set bonus_amount=150
   where id=(select row_id from holiday_bonus_outside_scope where role=actor.role);
   get diagnostics affected=row_count;
   if affected<>0 then raise exception '% changed amount on a truck outside their scope',actor.role; end if;
   update public.holiday_report_entries set bonus=false
   where id=(select row_id from holiday_bonus_outside_scope where role=actor.role);
   get diagnostics affected=row_count;
   if affected<>0 then raise exception '% changed Bonus on a truck outside their scope',actor.role; end if;
  end if;
  if actor.role='accounting' then
   denied := false;
   begin update public.holiday_report_entries set note='forbidden' where id=actor.row_id;
   exception when insufficient_privilege then denied := true; end;
   if not denied then raise exception 'Accounting changed note'; end if;
   denied := false;
   begin update public.holiday_report_entries set bonus=false where id=actor.row_id;
   exception when insufficient_privilege then denied := true; end;
   if not denied then raise exception 'Accounting changed bonus'; end if;
   delete from public.holiday_report_entries where id=actor.row_id;
   get diagnostics affected=row_count;
   if affected<>0 then raise exception 'Accounting deleted entry'; end if;
  end if;
  if actor.role <> 'accounting' then
   update public.holiday_report_entries set bonus=false where id=actor.row_id;
   if (select bonus_amount from public.holiday_report_entries where id=actor.row_id) is not null then raise exception 'No did not clear amount'; end if;
   denied := false;
   begin update public.holiday_report_entries set bonus_amount=100 where id=actor.row_id;
   exception when check_violation then denied := true; end;
   if not denied then raise exception 'Amount allowed with No'; end if;
  end if;
 end loop;
end $$;
reset role;
select 'Passed: scoped dispatcher and supervisor edits, accounting amount-only access, No clears and rejects amounts' result;
rollback;

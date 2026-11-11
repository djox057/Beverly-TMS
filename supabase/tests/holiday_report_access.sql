-- Run in an isolated database after the holiday migration, with auth.uid() and
-- public.user_roles available. Synthetic role fixtures are rolled back.
begin;
create temporary table holiday_test_actors (id uuid, roles public.app_role[], allowed boolean);
insert into holiday_test_actors
select gen_random_uuid(), array[r]::public.app_role[], r in ('admin','manager')
from unnest(enum_range(null::public.app_role)) r;
insert into holiday_test_actors values
  (gen_random_uuid(), array['manager','accounting']::public.app_role[], false),
  (gen_random_uuid(), array['manager','safety']::public.app_role[], false),
  (gen_random_uuid(), array['manager','claims']::public.app_role[], false),
  (gen_random_uuid(), array['admin','safety']::public.app_role[], true),
  (gen_random_uuid(), array['manager','supervisor']::public.app_role[], true),
  (gen_random_uuid(), array[]::public.app_role[], false);
insert into public.user_roles(user_id,role)
select a.id,r from holiday_test_actors a cross join lateral unnest(a.roles) r;
grant select on holiday_test_actors to authenticated;
insert into public.holiday_report_entries(year,holiday_slug,truck,note) values
  (2026,'christmas','03212','holiday-access-fixture'),
  (2027,'christmas','03212','holiday-access-fixture'),
  (2026,'thanksgiving','03212','holiday-access-fixture');
set local role authenticated;
do $test$
declare actor record; affected integer; denied boolean;
begin
  for actor in select * from holiday_test_actors loop
    perform set_config('request.jwt.claim.sub',actor.id::text,true);
    if actor.allowed then
      if (select count(*) from public.holiday_report_entries where note='holiday-access-fixture') <> 3 then raise exception 'Allowed user cannot read: %',actor.roles; end if;
      if (select count(*) from public.holiday_report_entries where note='holiday-access-fixture' and year=2026 and holiday_slug='christmas') <> 1 then raise exception 'Year/holiday isolation failed'; end if;
      insert into public.holiday_report_entries(year,holiday_slug,truck,note) values (2026,'easter','03212','holiday-crud-fixture');
      update public.holiday_report_entries set note='holiday-updated-fixture' where note='holiday-crud-fixture';
      get diagnostics affected = row_count;
      if affected<>1 then raise exception 'Allowed update denied'; end if;
      delete from public.holiday_report_entries where note='holiday-updated-fixture';
      get diagnostics affected = row_count;
      if affected<>1 then raise exception 'Allowed delete denied'; end if;
    else
      if exists(select 1 from public.holiday_report_entries) then raise exception 'Read leaked for %',actor.roles; end if;
      denied := false;
      begin
        insert into public.holiday_report_entries(year,holiday_slug,note) values (2026,'christmas','denied-write');
      exception when insufficient_privilege then denied := true;
      end;
      if not denied then raise exception 'Insert allowed for %',actor.roles; end if;
      update public.holiday_report_entries set note='denied-update';
      get diagnostics affected = row_count;
      if affected<>0 then raise exception 'Update leaked for %',actor.roles; end if;
      delete from public.holiday_report_entries;
      get diagnostics affected = row_count;
      if affected<>0 then raise exception 'Delete leaked for %',actor.roles; end if;
    end if;
  end loop;
end $test$;
reset role;
set local role anon;
do $test$
begin
  begin
    perform 1 from public.holiday_report_entries;
    raise exception 'Anonymous read unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $test$;
reset role;
rollback;

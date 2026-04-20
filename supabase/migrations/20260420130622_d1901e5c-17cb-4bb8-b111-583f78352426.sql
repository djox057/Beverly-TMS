-- ============================================================================
-- STEP C: Invariant test — user with both dispatch + afterhours roles
-- Test user: 85223eca-1644-43ce-9aab-7f04c6f5c3aa
-- Confirmed pre-state: single role = 'dispatch'
-- Expected: function logs action='error', roles unchanged, both still present
-- ============================================================================

-- 1. Setup: add the second role (afterhours) so the user has both
insert into public.user_roles (user_id, role)
values ('85223eca-1644-43ce-9aab-7f04c6f5c3aa'::uuid, 'afterhours'::app_role)
on conflict (user_id, role) do nothing;

-- 2. Setup: schedule the user for today
insert into public.afterhours_schedule (user_id, scheduled_date)
values (
  '85223eca-1644-43ce-9aab-7f04c6f5c3aa'::uuid,
  (now() at time zone 'America/Chicago')::date
);

-- 3. Re-create the guardless test function (will be dropped at the end)
create or replace function public.flip_afterhours_roles_test(direction text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  chicago_now timestamptz := now() at time zone 'America/Chicago';
  chicago_hour int;
  chicago_date date := chicago_now::date;
  expected_hour int;
  from_role_val app_role;
  to_role_val app_role;
  rec record;
  current_roles app_role[];
  dispatcher_name_val text;
begin
  if direction = 'promote' then
    expected_hour := 6;
    from_role_val := 'dispatch'::app_role;
    to_role_val := 'afterhours'::app_role;
  elsif direction = 'revert' then
    expected_hour := 17;
    from_role_val := 'afterhours'::app_role;
    to_role_val := 'dispatch'::app_role;
  else
    raise exception 'Invalid direction: %, expected promote or revert', direction;
  end if;

  chicago_hour := expected_hour;

  for rec in
    select s.id as schedule_id, s.user_id, s.dispatcher_name
    from public.afterhours_schedule s
    where s.scheduled_date = chicago_date
      and s.user_id is not null
  loop
    select array_agg(role) into current_roles
    from public.user_roles
    where user_id = rec.user_id;

    dispatcher_name_val := rec.dispatcher_name;

    if from_role_val = any(current_roles) and to_role_val = any(current_roles) then
      insert into public.role_flip_log
        (schedule_id, user_id, dispatcher_name, direction, action,
         from_role, to_role, message, chicago_date, chicago_hour)
      values
        (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'error',
         from_role_val, to_role_val,
         'Invariant violated: user has both dispatch and afterhours roles simultaneously. Manual intervention required.',
         chicago_date, chicago_hour);
      continue;
    end if;

    if to_role_val = any(current_roles) then
      insert into public.role_flip_log
        (schedule_id, user_id, dispatcher_name, direction, action,
         from_role, to_role, message, chicago_date, chicago_hour)
      values
        (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'skipped',
         from_role_val, to_role_val,
         'User already has target role',
         chicago_date, chicago_hour);
      continue;
    end if;

    if not (from_role_val = any(current_roles)) then
      insert into public.role_flip_log
        (schedule_id, user_id, dispatcher_name, direction, action,
         from_role, to_role, message, chicago_date, chicago_hour)
      values
        (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'skipped',
         from_role_val, to_role_val,
         format('User roles are %s; flip only handles dispatch<->afterhours', current_roles::text),
         chicago_date, chicago_hour);
      continue;
    end if;

    update public.user_roles
      set role = to_role_val
      where user_id = rec.user_id
        and role = from_role_val;

    insert into public.role_flip_log
      (schedule_id, user_id, dispatcher_name, direction, action,
       from_role, to_role, chicago_date, chicago_hour)
    values
      (rec.schedule_id, rec.user_id, dispatcher_name_val, direction, 'flipped',
       from_role_val, to_role_val, chicago_date, chicago_hour);
  end loop;
end;
$$;

-- 4. Run the flip — must hit the invariant branch
select public.flip_afterhours_roles_test('promote');

-- 5. Cleanup: drop the test function
drop function if exists public.flip_afterhours_roles_test(text);

-- 6. Cleanup: remove the temporary afterhours role (restore single-dispatch state)
delete from public.user_roles
where user_id = '85223eca-1644-43ce-9aab-7f04c6f5c3aa'::uuid
  and role = 'afterhours'::app_role;

-- 7. Cleanup: delete the test schedule row
delete from public.afterhours_schedule
where user_id = '85223eca-1644-43ce-9aab-7f04c6f5c3aa'::uuid
  and scheduled_date = (now() at time zone 'America/Chicago')::date;

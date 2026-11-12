alter table public.holiday_report_entries add column bonus boolean not null default false;
create or replace function public.holiday_actor_role() returns text
language sql stable security invoker set search_path = pg_catalog, public as $$
 select role::text from public.user_roles where auth.uid() is not null and user_id=auth.uid()
 order by case role::text when 'admin' then 0 when 'safety' then 1 when 'claims' then 2 when 'accounting' then 3 when 'manager' then 4 when 'supervisor' then 5 when 'chicago_management' then 6 when 'maintenance' then 7 when 'dispatch' then 8 when 'afterhours' then 9 when 'yard' then 10 when 'driver' then 11 else 12 end limit 1;
$$;
revoke all on function public.holiday_actor_role() from public, anon;
grant execute on function public.holiday_actor_role() to authenticated;
create or replace function public.holiday_allowed_trucks() returns setof text language sql stable security definer set search_path = pg_catalog, public as $$
with actor as (
 select auth.uid() id,
 (select role::text from public.user_roles where user_id=auth.uid() order by case role::text when 'admin' then 0 when 'safety' then 1 when 'claims' then 2 when 'accounting' then 3 when 'manager' then 4 when 'supervisor' then 5 when 'chicago_management' then 6 when 'maintenance' then 7 when 'dispatch' then 8 when 'afterhours' then 9 when 'yard' then 10 when 'driver' then 11 else 12 end limit 1) role,
 (select office from public.profiles where user_id=auth.uid() limit 1) office
)
select distinct t.truck_number from public.trucks t cross join actor a
left join public.drivers d1 on d1.id=t.driver1_id
left join public.drivers d2 on d2.id=t.driver2_id
where a.id is not null and t.is_active and (
 a.role in ('admin','accounting') or exists (
 select 1 from unnest(array[d1.dispatcher_id,d2.dispatcher_id,case when d1.dispatcher_id is null and d2.dispatcher_id is null then t.dispatcher_id end]) assigned(id)
 where assigned.id is not null and (
 (a.role='dispatch' and assigned.id=a.id)
 or (a.role='supervisor' and (assigned.id=a.id or exists(select 1 from public.dispatcher_supervisors ds where ds.supervisor_id=a.id and ds.dispatcher_id=assigned.id)))
 or (a.role='manager' and nullif(trim(a.office::text),'') is not null and exists(select 1 from public.profiles p where p.user_id=assigned.id and lower(trim(p.office::text))=lower(trim(a.office::text))))
 )
 )
); $$;
revoke all on function public.holiday_allowed_trucks() from public, anon;
grant execute on function public.holiday_allowed_trucks() to authenticated;

drop policy "Scoped holiday truck notes" on public.holiday_report_entries;
create policy "Holiday read access" on public.holiday_report_entries for select to authenticated
using ((select public.holiday_actor_role())='accounting' or truck in (select public.holiday_allowed_trucks()));
create policy "Holiday insert access" on public.holiday_report_entries for insert to authenticated
with check ((select public.holiday_actor_role()) in ('admin','manager','supervisor','dispatch') and truck in (select public.holiday_allowed_trucks()));
create policy "Holiday update access" on public.holiday_report_entries for update to authenticated
using ((select public.holiday_actor_role()) in ('admin','manager','supervisor','dispatch') and truck in (select public.holiday_allowed_trucks()))
with check ((select public.holiday_actor_role()) in ('admin','manager','supervisor','dispatch') and truck in (select public.holiday_allowed_trucks()));
create policy "Holiday delete access" on public.holiday_report_entries for delete to authenticated
using ((select public.holiday_actor_role()) in ('admin','manager','supervisor','dispatch') and truck in (select public.holiday_allowed_trucks()));

-- RLS scopes rows; this trigger additionally protects the Bonus column.
create or replace function public.guard_holiday_bonus() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 if (tg_op='INSERT' and new.bonus) or (tg_op='UPDATE' and new.bonus is distinct from old.bonus) then
  if coalesce(public.holiday_actor_role(),'') not in ('admin','manager') then
   raise exception 'Only admins and managers can edit holiday Bonus' using errcode='42501';
  end if;
 end if;
 return new;
end; $$;
revoke all on function public.guard_holiday_bonus() from public, anon;
create trigger holiday_bonus_guard before insert or update on public.holiday_report_entries
for each row execute function public.guard_holiday_bonus();

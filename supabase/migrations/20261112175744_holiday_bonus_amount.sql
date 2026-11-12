alter table public.holiday_report_entries add column bonus_amount numeric(9,2);
alter table public.holiday_report_entries add constraint holiday_bonus_amount_valid
check (bonus_amount is null or (bonus and bonus_amount > 0 and bonus_amount <= 9999999.99));

-- Accounting retains full visibility and gains only amount editing, enforced below.
create policy "Holiday accounting amount update" on public.holiday_report_entries
for update to authenticated
using ((select public.holiday_actor_role()) = 'accounting')
with check ((select public.holiday_actor_role()) = 'accounting');

create or replace function public.guard_holiday_bonus() returns trigger
language plpgsql security invoker set search_path = pg_catalog, public as $$
declare actor_role text;
begin
 if current_user in ('postgres','service_role','supabase_admin') then return new; end if;
 actor_role := coalesce(public.holiday_actor_role(),'');
 if tg_op='UPDATE' and actor_role='accounting'
    and (to_jsonb(new) - 'bonus_amount') is distinct from (to_jsonb(old) - 'bonus_amount') then
  raise exception 'Accounting can only edit holiday bonus amounts' using errcode='42501';
 end if;
 if (tg_op='INSERT' and new.bonus) or (tg_op='UPDATE' and new.bonus is distinct from old.bonus) then
  if actor_role not in ('admin','manager') then
   raise exception 'Only admins and managers can edit holiday Bonus' using errcode='42501';
  end if;
 end if;
 if (tg_op='INSERT' and new.bonus_amount is not null)
    or (tg_op='UPDATE' and new.bonus_amount is distinct from old.bonus_amount) then
  if actor_role not in ('admin','manager','accounting') then
   raise exception 'Only admins, managers and accounting can edit holiday bonus amounts' using errcode='42501';
  end if;
 end if;
 -- Keep older clients compatible when switching Bonus back to No.
 if tg_op='UPDATE' and old.bonus and not new.bonus
    and new.bonus_amount is not distinct from old.bonus_amount then
  new.bonus_amount := null;
 end if;
 return new;
end; $$;

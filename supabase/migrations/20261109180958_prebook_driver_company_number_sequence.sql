set local lock_timeout='10s';
create table private.prebook_number_changes (
 id uuid primary key default gen_random_uuid(),order_id uuid not null,
 old_company_id uuid,new_company_id uuid not null,old_number text,new_number text not null,
 changed_at timestamptz not null default now()
);
alter table private.prebook_number_changes enable row level security;
revoke all on private.prebook_number_changes from public,anon,authenticated;
grant all on private.prebook_number_changes to service_role;
create policy "Service manages prebook number history" on private.prebook_number_changes for all to service_role using(true) with check(true);
create function private.assign_prebook_driver_number() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_company uuid;v_name text;v_number text;v_old_number text;v_old_company uuid;
begin
 if new.driver1_id is null or not(coalesce(new.prebook,false) or new.prebook_original_booked_by is not null) then return new; end if;
 select d.company_id,c.name into v_company,v_name from public.drivers d join public.companies c on c.id=d.company_id where d.id=new.driver1_id;
 if v_company is null or v_company is not distinct from new.company_id then return new; end if;
 perform pg_advisory_xact_lock(hashtext('create_order_with_unique_load_number'),hashtext(v_company::text));
 v_number:=public.preview_next_internal_load_number(v_company);
 if v_name in ('United Enterprise Solutions INC','BF Prime LLC') then v_number:=v_number||'-1'; end if;
 if exists(select 1 from public.orders where company_id=v_company and internal_load_number=v_number and id<>new.id) then
  raise exception 'Next company load number is already used; retry assignment' using errcode='23505';
 end if;
 v_old_number:=new.internal_load_number;v_old_company:=new.company_id;
 new.company_id:=v_company;new.internal_load_number:=v_number;
 new.load_company_code:=private.prebook_company_code(v_name);
 insert into private.prebook_number_changes(order_id,old_company_id,new_company_id,old_number,new_number)
 values(new.id,v_old_company,v_company,v_old_number,v_number);
 return new;
end $$;
revoke all on function private.assign_prebook_driver_number() from public,anon,authenticated;
-- Runs before the existing number normalizer and company-code trigger.
create trigger m_assign_prebook_driver_number before insert or update of driver1_id,prebook on public.orders
 for each row execute function private.assign_prebook_driver_number();
do $$ declare v_company uuid;v_order uuid;begin
 for v_company in select id from public.companies order by id loop
  perform pg_advisory_xact_lock(hashtext('create_order_with_unique_load_number'),hashtext(v_company::text));
 end loop;
 lock table public.orders in share row exclusive mode;
 -- Each update is a separate statement so the next counter sees the last number.
 for v_order in select o.id from public.orders o join public.drivers d on d.id=o.driver1_id
 where (o.prebook or o.prebook_original_booked_by is not null) and d.company_id is not null
 and o.company_id is distinct from d.company_id order by o.created_at,o.id loop
  update public.orders set driver1_id=driver1_id where id=v_order;
 end loop;
end $$;

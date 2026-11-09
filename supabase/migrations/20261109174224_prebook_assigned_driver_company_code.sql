create function private.prebook_company_code(p_name text) returns text
language sql immutable set search_path='' as $$ select case
 when p_name ilike '%hart freight%' then 'HT'
 when p_name ilike '%gd trucking%' then 'GD'
 when p_name ilike '%lale transport%' then 'LT'
 when p_name ilike '%jones freight%' then 'JF'
 when p_name ilike '%bf prime united%' then 'BFU'
 when p_name ilike '%bf prime%' then 'BFP'
 when p_name ilike '%beverly freight%' then 'BF'
 when p_name ilike '%united enterprise%' then 'UE'
 when p_name ilike '%bg prime%' then 'BG'
 when p_name ilike '%ap silver%' then 'AP'
 else null end; $$;
revoke all on function private.prebook_company_code(text) from public,anon,authenticated;
create function private.set_assigned_prebook_company_code() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_code text;
begin
 if not coalesce(new.prebook,false) or new.driver1_id is null then return new; end if;
 if tg_op='UPDATE' then
  if old.driver1_id is not distinct from new.driver1_id and old.prebook is not distinct from new.prebook then return new; end if;
 end if;
 select private.prebook_company_code(c.name) into v_code
 from public.drivers d join public.companies c on c.id=d.company_id where d.id=new.driver1_id;
 if v_code is not null then new.load_company_code:=v_code; end if;
 return new;
end $$;
revoke all on function private.set_assigned_prebook_company_code() from public,anon,authenticated;
create trigger zz_prebook_assigned_company_code before insert or update of driver1_id,prebook on public.orders
 for each row execute function private.set_assigned_prebook_company_code();
-- Only assigned prebooks (including preserved former prebooks), only the code.
-- No number, booking company, rate or assignment fields are rewritten.
update public.orders o set load_company_code=private.prebook_company_code(c.name)
 from public.drivers d join public.companies c on c.id=d.company_id
 where o.driver1_id=d.id and (o.prebook or o.prebook_original_booked_by is not null)
 and private.prebook_company_code(c.name) is not null
 and o.load_company_code is distinct from private.prebook_company_code(c.name);

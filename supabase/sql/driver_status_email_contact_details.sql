-- Add driver contact details to future status snapshots; live sending remains disabled.
create or replace function driver_status_private.enqueue()
returns trigger language plpgsql security definer set search_path='' as $$
declare action_name text; company_name text;
begin
  if not exists(select 1 from public.driver_status_email_settings where enabled) then return new; end if;
  action_name := driver_status_private.status_action(old.is_active,new.is_active,old.two_week_block_date,new.two_week_block_date);
  if action_name is null then return new; end if;
  select c.name into company_name from public.companies c where c.id=new.company_id;
  insert into public.driver_status_emails(driver_id,action,driver_snapshot,old_notice_date,new_notice_date)
  values(new.id,action_name,jsonb_build_object('name',new.name,'first_name',new.first_name,'last_name',new.last_name,'hire_date',new.hire_date,'termination_date',new.termination_date,'company',company_name,'phone',new.phone,'email',new.email,'home_city',new.home_city,'home_state',new.home_state),old.two_week_block_date,new.two_week_block_date);
  return new;
end;
$$;
revoke all on function driver_status_private.enqueue() from public,anon,authenticated;

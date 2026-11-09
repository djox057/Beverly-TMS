-- Resolve future events through preserved office records when the owning profile was deleted.
create or replace function turnover_private.capture_status_event() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_dispatcher uuid;v_name text;v_office text;v_company uuid;v_company_name text;v_day date;v_estimated boolean:=false;
begin
 if old.is_active is not distinct from new.is_active then return new; end if;
 v_day := (now() at time zone 'America/Chicago')::date;
 if v_day<date '2026-04-01' then return new; end if;
 if old.is_active and not new.is_active then
   v_dispatcher:=coalesce(old.dispatcher_id,new.last_dispatcher_id,old.last_dispatcher_id);
   v_company:=old.company_id;
 else
   v_dispatcher:=coalesce(new.dispatcher_id,old.last_dispatcher_id,old.dispatcher_id);
   v_company:=new.company_id;
 end if;
 select p.full_name,p.office::text into v_name,v_office from public.profiles p where p.user_id=v_dispatcher;
 if not found then
  select p.dispatcher_name,coalesce(p.last_known_office,p.office),p.last_known_office is null
  into v_name,v_office,v_estimated from turnover_private.legacy_dispatchers p where p.dispatcher_id=v_dispatcher;
 end if;
 select c.name into v_company_name from public.companies c where c.id=v_company;
 insert into turnover_private.events(driver_id,driver_name,dispatcher_id,dispatcher_name,office,company_id,company_name,event_type,occurred_on,occurred_at,counts_as_turnover,reason,source,office_estimated)
 values(new.id,coalesce(nullif(new.name,''),nullif(concat_ws(' ',new.first_name,new.last_name),''),'Unknown'),
 v_dispatcher,coalesce(v_name,old.last_dispatcher_name,'Unassigned'),coalesce(v_office,'Unknown'),v_company,coalesce(v_company_name,new.company_name),
 case when new.is_active then 'reactivation' else 'departure' end,v_day,now(),
 case when new.is_active then false else coalesce(new.counts_as_turnover,true) end,
 case when not new.is_active then (select string_agg(n.note,E'\n' order by n.created_at) from public.driver_termination_notes n where n.driver_id=new.id) else null end,'captured',coalesce(v_estimated,true));
 return new;
end $$;
revoke all on function turnover_private.capture_status_event() from public,anon,authenticated;

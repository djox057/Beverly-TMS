-- Expose invoker-only RPC wrappers. Privileged reads stay in the unexposed
-- private schema, with the same mandatory real-admin/service-role check.
alter function public.get_turnover_metrics(date,date) set schema turnover_private;
alter function public.get_turnover_events(date,date,text,uuid,boolean,integer,integer,boolean) set schema turnover_private;
grant usage on schema turnover_private to authenticated;
-- USAGE is name resolution only; no table SELECT/write privileges are granted.
grant execute on function turnover_private.get_turnover_metrics(date,date) to authenticated,service_role;
grant execute on function turnover_private.get_turnover_events(date,date,text,uuid,boolean,integer,integer,boolean) to authenticated,service_role;
create function public.get_turnover_metrics(p_start date,p_end date) returns jsonb
language sql security invoker set search_path='' as $$
 select turnover_private.get_turnover_metrics(p_start,p_end);
$$;
create function public.get_turnover_events(p_start date,p_end date,p_office text default null,p_dispatcher uuid default null,p_unassigned boolean default false,p_offset integer default 0,p_limit integer default 50,p_include_excluded boolean default false) returns jsonb
language sql security invoker set search_path='' as $$
 select turnover_private.get_turnover_events(p_start,p_end,p_office,p_dispatcher,p_unassigned,p_offset,p_limit,p_include_excluded);
$$;
revoke all on function public.get_turnover_metrics(date,date) from public,anon;
revoke all on function public.get_turnover_events(date,date,text,uuid,boolean,integer,integer,boolean) from public,anon;
grant execute on function public.get_turnover_metrics(date,date) to authenticated,service_role;
grant execute on function public.get_turnover_events(date,date,text,uuid,boolean,integer,integer,boolean) to authenticated,service_role;
notify pgrst,'reload schema';

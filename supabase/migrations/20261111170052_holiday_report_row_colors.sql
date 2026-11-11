-- Match the daily report color controls without changing daily report data.
alter table public.holiday_report_entries add column color text
  check (color is null or color in ('red','orange','yellow','cyan','green'));

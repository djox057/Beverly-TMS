---
name: Friday auto on-duty dispatcher restore
description: Edge function restore-dispatchers-on-duty automatically sets every Off Duty dispatcher back to On Duty every Friday at 23:59 Chicago time
type: feature
---
Edge function `restore-dispatchers-on-duty` runs every Friday at 23:59 Chicago time
(scheduled via two pg_cron entries — `restore-dispatchers-on-duty-cdt` at `59 4 * * 6`
UTC and `restore-dispatchers-on-duty-cst` at `59 5 * * 6` UTC; the function
self-checks Chicago weekday=Fri/hour=23 so only the active DST window runs).

For every dispatcher_status row with is_active=false, it mirrors the manual
`setDispatcherActive` flow in src/hooks/useFleetManagement.ts:
- reads stored drivers from `inactive_trucks` jsonb,
- reassigns each still-active driver back to that dispatcher,
- sets is_active=true and clears `inactive_trucks`.

Manual run: invoke with `?force=1` (or body `{"force": true}`) to bypass the
weekday/hour check (admin/testing only).

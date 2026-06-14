---
name: Maintenance classification in afterhours schedule
description: A user is treated as Maintenance only when role='maintenance' OR (role='afterhours' AND profile.office is null). Office-bearing afterhours users are dispatchers flipped by the daily role-switcher and must stay in their office bucket.
type: feature
---
In `src/components/AfterhoursScheduleDialog.tsx` the Maintenance bucket is
computed from BOTH role and profile.office:

    isMaintenance =
      roles.has('maintenance') ||
      (roles.has('afterhours') && !profile.office)

Why: the daily afterhours role-switcher flips weekday dispatchers between
`dispatch` and `afterhours`. A naive `role IN ('maintenance','afterhours')`
filter sweeps every flipped dispatcher into Maintenance, emptying ČAČAK/BG/KG
office buckets in the Weekend Schedule dialog. True Maintenance staff have
`profile.office = NULL`; flipped dispatchers keep their office.

Applies to both `fetchUsers` and `fetchExistingSchedules`.

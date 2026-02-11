

## Stagger All Frequent Cron Jobs to Eliminate CPU Spikes

### Problem
Three jobs currently collide at minutes 0 and 30:
- **Job 16** (`get-truck-distances-batch`): `*/5` -- fires at 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55
- **Job 18** (`hos-sync`): `*/3` -- fires at 0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30...
- **Job 21** (`sync-google-sheets`): `*/30` -- fires at 0, 30

Simply moving Job 21 to 15,45 just shifts the bottleneck from 0/30 to 15/45 (where Job 16 also fires).

### Solution -- Offset Each Job

| Job | Current Schedule | New Schedule | Fires At |
|-----|-----------------|--------------|----------|
| 16 (truck-distances) | `*/5 * * * *` (0,5,10...) | `2,7,12,17,22,27,32,37,42,47,52,57 * * * *` | Offset by +2 min |
| 18 (hos-sync) | `*/3 * * * *` (0,3,6...) | `1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 * * * *` | Offset by +1 min |
| 21 (sync-google-sheets) | `*/30 * * * *` (0,30) | `15,45 * * * *` | Offset by +15 min |

### Collision Check

With this staggering, no two jobs ever fire at the same minute:
- Job 16 fires at: 2, 7, 12, 17, 22, 27, 32, 37, 42, 47, 52, 57
- Job 18 fires at: 1, 4, 10, 13, 16, 19, 25, 28, 31, 34, 40, 43, 46, 49, 55, 58
- Job 21 fires at: 15, 45

No overlaps at all.

### Technical Details

A single SQL migration will:
1. Unschedule Job 16 (`get-truck-distances-batch-every-5-min`)
2. Unschedule Job 18 (`hos-sync-every-minute`)
3. Unschedule Job 21 (`sync-google-sheets-every-30min`)
4. Reschedule all three with their new offset cron expressions, keeping the same HTTP calls and headers

The infrequent jobs (9, 14, 15, 17) run once daily and don't need changes.




## Fix: Duplicate key warnings in Orders page broker Combobox

### Problem
The broker filter Combobox on the Orders page uses `broker.name` as the option `value` (line 810 in Orders.tsx). Since multiple brokers can share the same name (e.g., "EVANS DELIVERY COMPANY, INC."), this creates duplicate React keys and duplicate entries.

### Plan

**File: `src/pages/Orders.tsx`**

1. Change `uniqueBrokerOptions` (lines 806-813) to use `b.id` as the value instead of `b.name`
2. Update the broker filter comparison logic (line 541) from `order.brokerName === brokerFilter` to compare against `order.brokerId === brokerFilter`
3. Update the default/reset value from `"all-brokers"` string checks — these stay the same since `"all-brokers"` is a sentinel value
4. Remove or update the server-side filter lookup (line 408-409) since `brokerFilter` will already be the broker ID, no need to `.find()` by name

### Changes summary
- `uniqueBrokerOptions`: `value: b.name` → `value: b.id`
- Filter match (line 541): compare `order.brokerId` instead of `order.brokerName`
- Server filter (lines 408-409): use `brokerFilter` directly as `brokerId` instead of looking up by name


# Add searchable broker dropdown to Dedicated Lanes

## What

On Beverly Heatmap → Dedicated lanes tab, add a searchable broker dropdown next to the existing filters. When a broker is selected, the lanes table only shows that broker's dedicated lanes.

## Where

`src/pages/BeverlyHeatmapDeepSearch.tsx`

## How

1. Import the existing `BrokerCombobox` from `src/components/ui/broker-combobox.tsx` (already supports search by name + MC, debounced, capped list).
2. Add state `const [brokerId, setBrokerId] = useState<string>("")`.
3. Place the combobox in the filter row (after Delivery radius, before the date range picker), with a label "Broker (optional)" and width ~240px. Include a small "Clear" affordance if a broker is selected (or rely on the combobox's own clear behavior).
4. Filter client-side in the existing `sortedDeep` `useMemo`: when `brokerId` is set, keep only lanes where `l.broker_id === brokerId`. No edge-function change needed — the function already returns `broker_id` per lane.
5. Update the "Scanned N loads" hint to also show filtered lane count when a broker is selected, e.g. `Scanned 12,345 loads · Showing 7 lanes for {brokerName}`.

## Out of scope

- No change to the `lane-deep-search` edge function.
- No change to other heatmap tabs.
- No backend/SQL changes.

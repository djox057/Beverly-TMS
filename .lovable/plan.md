

# Add Fuel Level to Trucks via HOS Sync

## Database Change
Add a `fuel_level` integer column (nullable) to the `trucks` table to store the fuel percentage from the Transit Tracking API.

```sql
ALTER TABLE public.trucks ADD COLUMN fuel_level integer;
```

## Edge Function: `hos-sync/index.ts`

1. **Update `TransitRecord` interface** — add `fuel?: number`
2. **After matching a truck to API data**, write the fuel value to the truck record
3. Since HOS sync currently updates `drivers` (not trucks), we need a separate batch update for trucks' fuel levels
4. Collect `{ truck_id, fuel_level }` pairs during the truck loop, then do a single batch update on the `trucks` table at the end

### Implementation detail:
- In the main truck loop, after matching `hosData` for a truck, capture `hosData.fuel` (it's already a number, 0-100 range based on the sample data)
- After the driver HOS updates, run a batch update: `UPDATE trucks SET fuel_level = X WHERE id = Y` for all matched trucks
- Use a simple `.upsert()` or loop of `.update()` calls, or a new small RPC. Given the truck count is manageable (~50-100), a single `Promise.all` of individual updates or a simple RPC is fine.

### Simplest approach — direct updates in a loop:
```typescript
const fuelUpdates: { id: string; fuel: number }[] = [];
// In truck loop:
if (hosData) fuelUpdates.push({ id: truck.id, fuel: hosData.fuel ?? 0 });
// After driver updates:
if (fuelUpdates.length) {
  await Promise.all(fuelUpdates.map(u =>
    supabase.from('trucks').update({ fuel_level: u.fuel }).eq('id', u.id)
  ));
}
```

## Files Changed
1. **Migration** — add `fuel_level` column to `trucks`
2. **`supabase/functions/hos-sync/index.ts`** — add `fuel` to interface, collect fuel per truck, batch update trucks table

No UI changes needed yet (fuel display can be added separately).




## Add Anon SELECT Policies for drivers, trucks, trailers

**Problem**: An external application uses the anon key to read from `drivers`, `trucks`, and `trailers`. RLS is enabled but all existing SELECT policies only grant access to authenticated roles — the `anon` role has no SELECT access.

### Change

**One migration** adding three SELECT policies targeting the `anon` role:

```sql
CREATE POLICY "Allow anon select" ON public.drivers FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon select" ON public.trucks FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon select" ON public.trailers FOR SELECT TO anon USING (true);
```

No code changes needed. No other tables affected.

### Security note

This exposes all rows in these three tables to anyone with the anon key. The anon key is already public (embedded in the frontend), so all driver, truck, and trailer data will be readable without authentication. This is acceptable only if none of these tables contain sensitive PII you want to protect. (Driver PII like SSN is stored in a separate `driver_sensitive_pii` table, which is not affected.)


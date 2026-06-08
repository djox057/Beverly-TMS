import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") ?? Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// BG Prime Inc — excluded from /orders booked-by scope
const EXCLUDED_BOOKED_BY_COMPANY_ID = "238a7acf-cbb5-4718-be7a-130d8d971a90";

const FROM = "2026-01-01 00:00:00";
const TO = "2026-06-07 23:59:59";

Deno.test("search-orders returns all unlocked rows in the first batch for Jan 1 – Jun 7, 2026", async () => {
  // 1. Reference counts directly from the DB (bypass RLS via service role).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const baseCount = (await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .gte("delivery_datetime", FROM)
    .lte("delivery_datetime", TO)
    .or(`booked_by_company_id.neq.${EXCLUDED_BOOKED_BY_COMPANY_ID},booked_by_company_id.is.null`));

  const unlockedCount = (await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("locked", false)
    .gte("delivery_datetime", FROM)
    .lte("delivery_datetime", TO)
    .or(`booked_by_company_id.neq.${EXCLUDED_BOOKED_BY_COMPANY_ID},booked_by_company_id.is.null`));

  const expectedTotal = baseCount.count!;
  const expectedUnlocked = unlockedCount.count!;

  console.log(`[test] DB expects total=${expectedTotal}, unlocked=${expectedUnlocked}`);
  assert(expectedUnlocked > 0, "expected at least one unlocked order in date range");

  // 2. Call the edge function with the same filter the /orders UI sends.
  const res = await fetch(`${SUPABASE_URL}/functions/v1/search-orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      filters: {
        deliveryDateFrom: FROM,
        deliveryDateTo: TO,
        excludeBookedByCompanyId: EXCLUDED_BOOKED_BY_COMPANY_ID,
      },
      offset: 0,
      limit: 500,
    }),
  });

  const body = await res.json();
  assertEquals(res.status, 200, `non-200 response: ${JSON.stringify(body)}`);

  const orders: Array<{ locked: boolean }> = body.orders ?? [];
  const returnedUnlocked = orders.filter((o) => o.locked === false).length;

  // 3. totalCount within ±50 (allow for new orders created during the test run).
  const totalDiff = Math.abs((body.totalCount ?? -1) - expectedTotal);
  assert(
    totalDiff <= 50,
    `totalCount mismatch: expected ~${expectedTotal}, got ${body.totalCount} (diff ${totalDiff})`,
  );

  // 4. Every unlocked order in the date range must appear in the first batch.
  assertEquals(
    returnedUnlocked,
    expectedUnlocked,
    `first batch returned ${returnedUnlocked} unlocked rows but DB has ${expectedUnlocked}`,
  );

  // 5. Server-side ordering: every unlocked row must come before any locked row.
  const firstLockedIdx = orders.findIndex((o) => o.locked === true);
  if (firstLockedIdx !== -1) {
    const lateUnlocked = orders.slice(firstLockedIdx).find((o) => o.locked === false);
    assert(
      !lateUnlocked,
      "found an unlocked order after a locked one — server-side `order by locked asc` is not applied",
    );
  }
});
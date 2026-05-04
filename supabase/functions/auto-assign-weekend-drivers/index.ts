import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

/**
 * auto-assign-weekend-drivers
 *
 * Scheduled to run every Saturday at 01:00 Chicago time (via two pg_cron
 * entries for CDT and CST). Self-checks Chicago weekday=Sat & hour=1 so
 * a DST mismatch is a no-op.
 *
 * Mirrors `autoAssignDrivers` in src/hooks/useAfterhoursAssignments.ts:
 *   - Computes the upcoming weekend dates (Sat + Sun).
 *   - For each weekend day, distributes active drivers across the
 *     scheduled afterhours dispatchers, grouped by office, keeping each
 *     dispatcher's own weekday drivers when possible and balancing the
 *     remainder via greedy bin-packing.
 *   - Replaces any existing assignments for the upcoming weekend dates.
 *
 * Manual run: invoke with `?force=1` (or body `{"force": true}`) to bypass
 * the weekday/hour self-check (admin/testing only).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const invocationId = crypto.randomUUID();

  // BG 1st floor and BG 4th floor are treated as a single "BG" office for
  // weekend distribution purposes. Underlying profile.office values are
  // unchanged; this only affects bucketing.
  const BG_OFFICES = new Set(["BG 1st floor", "BG 4th floor"]);
  const groupKey = (office: string | null | undefined): string =>
    office && BG_OFFICES.has(office) ? "BG" : (office || "Unknown");

  // --- Auth ---
  const cronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const cronSecretEnv = Deno.env.get("CRON_SECRET");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  let authMethod: string | null = null;
  if (cronSecretEnv && cronSecret === cronSecretEnv) {
    authMethod = "cron-secret";
  } else if (cronSecretEnv && authHeader === `Bearer ${cronSecretEnv}`) {
    authMethod = "cron-secret-bearer";
  } else if (anonKey && authHeader === `Bearer ${anonKey}`) {
    authMethod = "anon-bearer";
  } else if (serviceRoleKey && authHeader?.includes(serviceRoleKey)) {
    authMethod = "service-role";
  }

  if (!authMethod) {
    console.error(`[${invocationId}] Unauthorized`);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // --- Parse force flag ---
  const url = new URL(req.url);
  let force = url.searchParams.get("force") === "1";
  try {
    const body = await req.json();
    if (body?.force === true) force = true;
  } catch { /* no body */ }

  // --- Chicago time self-check: Saturday @ 01:xx ---
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
  const yyyy = parts.find((p) => p.type === "year")?.value;
  const mm = parts.find((p) => p.type === "month")?.value;
  const dd = parts.find((p) => p.type === "day")?.value;

  console.log(
    `[${invocationId}] Chicago=${weekday} ${yyyy}-${mm}-${dd} ${hour}:${minute} auth=${authMethod} force=${force}`,
  );

  if (!force && weekday !== "Sat") {
    return new Response(
      JSON.stringify({ skipped: true, reason: "not-saturday", weekday, hour, minute }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  if (!force && hour !== 1) {
    return new Response(
      JSON.stringify({ skipped: true, reason: "wrong-hour", weekday, hour, minute }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    // Compute upcoming Sat/Sun in Chicago. When run on Sat 01:00, the
    // upcoming weekend IS today (Sat) + tomorrow (Sun).
    const todayChicago = `${yyyy}-${mm}-${dd}`;
    // Build a UTC anchor at noon to avoid DST edge cases when adding 1 day.
    const sat = new Date(`${todayChicago}T12:00:00Z`);
    const sun = new Date(sat.getTime() + 24 * 60 * 60 * 1000);
    const satStr = todayChicago;
    const sunStr = sun.toISOString().split("T")[0];
    const weekendDates = [satStr, sunStr];

    // --- Fetch scheduled afterhours users for those dates ---
    const { data: schedule, error: scheduleErr } = await supabase
      .from("afterhours_schedule")
      .select("user_id, scheduled_date")
      .in("scheduled_date", weekendDates);
    if (scheduleErr) throw scheduleErr;

    const dateUsersMap = new Map<string, Set<string>>();
    const allUserIds = new Set<string>();
    (schedule ?? []).filter((s) => s.user_id).forEach((s) => {
      allUserIds.add(s.user_id as string);
      if (!dateUsersMap.has(s.scheduled_date)) {
        dateUsersMap.set(s.scheduled_date, new Set());
      }
      dateUsersMap.get(s.scheduled_date)!.add(s.user_id as string);
    });

    // Filter out maintenance users; load profile offices.
    const userOfficeMap = new Map<string, string | null>();
    if (allUserIds.size > 0) {
      const ids = [...allUserIds];
      const [profilesRes, maintRes] = await Promise.all([
        supabase.from("profiles").select("user_id, office").in("user_id", ids),
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "maintenance")
          .in("user_id", ids),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const maintIds = new Set((maintRes.data ?? []).map((r: any) => r.user_id));
      (profilesRes.data ?? []).forEach((p: any) => {
        if (!maintIds.has(p.user_id)) {
          userOfficeMap.set(p.user_id, p.office ?? null);
        }
      });
    }

    // --- Active drivers + their dispatcher offices ---
    const { data: drivers, error: driversErr } = await supabase
      .from("drivers")
      .select("id, dispatcher_id, is_active")
      .eq("is_active", true);
    if (driversErr) throw driversErr;

    const dispatcherIds = [
      ...new Set((drivers ?? []).map((d: any) => d.dispatcher_id).filter(Boolean)),
    ] as string[];
    const dispatcherOfficeMap = new Map<string, string | null>();
    if (dispatcherIds.length > 0) {
      const { data: dispProfiles, error: dispErr } = await supabase
        .from("profiles")
        .select("user_id, office")
        .in("user_id", dispatcherIds);
      if (dispErr) throw dispErr;
      (dispProfiles ?? []).forEach((p: any) => {
        dispatcherOfficeMap.set(p.user_id, p.office ?? null);
      });
    }

    type EnrichedDriver = { id: string; dispatcher_id: string | null; office: string };
    const enrichedDrivers: EnrichedDriver[] = (drivers ?? []).map((d: any) => ({
      id: d.id,
      dispatcher_id: d.dispatcher_id ?? null,
      office: groupKey(d.dispatcher_id ? dispatcherOfficeMap.get(d.dispatcher_id) : null),
    }));

    const driversByOffice = new Map<string, EnrichedDriver[]>();
    for (const d of enrichedDrivers) {
      if (!driversByOffice.has(d.office)) driversByOffice.set(d.office, []);
      driversByOffice.get(d.office)!.push(d);
    }

    // --- Clear existing assignments for these dates (and legacy null-date) ---
    const { error: delErr } = await supabase
      .from("afterhours_assignments")
      .delete()
      .in("scheduled_date", weekendDates);
    if (delErr) throw delErr;
    await supabase
      .from("afterhours_assignments")
      .delete()
      .is("scheduled_date", null);

    // --- Build per-day distribution ---
    const allRows: { afterhours_user_id: string; driver_id: string; scheduled_date: string }[] = [];

    for (const date of weekendDates) {
      const userIdsForDay = [...(dateUsersMap.get(date) ?? new Set<string>())]
        .filter((uid) => userOfficeMap.has(uid));
      if (userIdsForDay.length === 0) continue;

      // Group weekend dispatchers by office
      const weekendByOffice = new Map<string, string[]>();
      for (const uid of userIdsForDay) {
        const office = groupKey(userOfficeMap.get(uid));
        if (!weekendByOffice.has(office)) weekendByOffice.set(office, []);
        weekendByOffice.get(office)!.push(uid);
      }

      for (const [office, weekendDispatchers] of weekendByOffice) {
        const officeDrivers = driversByOffice.get(office) || [];
        if (officeDrivers.length === 0 || weekendDispatchers.length === 0) continue;

        const numWD = weekendDispatchers.length;

        // Group office drivers by their weekday dispatcher
        const groupsByDispatcher = new Map<string, EnrichedDriver[]>();
        for (const d of officeDrivers) {
          const key = d.dispatcher_id || "__none__";
          if (!groupsByDispatcher.has(key)) groupsByDispatcher.set(key, []);
          groupsByDispatcher.get(key)!.push(d);
        }
        const groups = [...groupsByDispatcher.entries()]
          .map(([dispId, ds]) => ({ dispId, drivers: [...ds] }))
          .sort((a, b) => b.drivers.length - a.drivers.length);

        // Sort weekend dispatchers by their weekday-driver count desc
        const weekdayCount = new Map<string, number>();
        for (const wd of weekendDispatchers) {
          weekdayCount.set(wd, officeDrivers.filter((d) => d.dispatcher_id === wd).length);
        }
        const sortedWD = [...weekendDispatchers].sort(
          (a, b) => (weekdayCount.get(b) || 0) - (weekdayCount.get(a) || 0),
        );

        const totalDrivers = officeDrivers.length;
        const baseShare = Math.floor(totalDrivers / numWD);
        const extra = totalDrivers % numWD;

        const capacity = new Map<string, number>();
        const assigned = new Map<string, string[]>();
        sortedWD.forEach((wd, i) => {
          capacity.set(wd, baseShare + (i < extra ? 1 : 0));
          assigned.set(wd, []);
        });

        // First pass: each WD takes their OWN weekday drivers as a single
        // block (no per-capacity cap here; we still try to keep the group
        // together). The second pass enforces overall load balance.
        for (const wd of sortedWD) {
          const ownGroup = groups.find((g) => g.dispId === wd);
          if (ownGroup && ownGroup.drivers.length > 0) {
            assigned.get(wd)!.push(...ownGroup.drivers.map((d) => d.id));
            ownGroup.drivers.length = 0;
          }
        }

        // Second pass: place each remaining weekday-dispatcher group as a
        // WHOLE block under the weekend dispatcher with the largest remaining
        // capacity. Only split the group when no WD can absorb it without
        // exceeding the largest current load by more than 1 driver.
        const remaining = groups
          .filter((g) => g.drivers.length > 0)
          .sort((a, b) => b.drivers.length - a.drivers.length);

        for (const group of remaining) {
          while (group.drivers.length > 0) {
            // Find WD with most remaining capacity
            let bestWD = sortedWD[0];
            let bestRem = capacity.get(bestWD)! - assigned.get(bestWD)!.length;
            for (const wd of sortedWD) {
              const rem = capacity.get(wd)! - assigned.get(wd)!.length;
              if (rem > bestRem) { bestRem = rem; bestWD = wd; }
            }

            if (bestRem >= group.drivers.length) {
              // Whole group fits within capacity — keep it together.
              assigned.get(bestWD)!.push(...group.drivers.map((d) => d.id));
              group.drivers.length = 0;
              continue;
            }

            // No WD has enough free capacity for the whole group.
            // Decide: place whole group anyway (tolerable imbalance) or split.
            // Tolerable = placing the whole group keeps bestWD's load within
            // 1 of the current max load across WDs.
            const maxLoad = Math.max(...sortedWD.map((wd) => assigned.get(wd)!.length));
            const projected = assigned.get(bestWD)!.length + group.drivers.length;
            if (projected <= maxLoad + 1) {
              assigned.get(bestWD)!.push(...group.drivers.map((d) => d.id));
              group.drivers.length = 0;
              continue;
            }

            // Otherwise split: take as many as fit (at least 1) into bestWD,
            // loop continues with the rest.
            const take = group.drivers.splice(0, Math.max(bestRem, 1));
            assigned.get(bestWD)!.push(...take.map((d) => d.id));
          }
        }

        for (const [wdId, driverIds] of assigned) {
          for (const dId of driverIds) {
            allRows.push({ afterhours_user_id: wdId, driver_id: dId, scheduled_date: date });
          }
        }
      }
    }

    // --- Bulk insert ---
    let inserted = 0;
    if (allRows.length > 0) {
      for (let i = 0; i < allRows.length; i += 500) {
        const chunk = allRows.slice(i, i + 500);
        const { error } = await supabase.from("afterhours_assignments").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
      }
    }

    console.log(
      `[${invocationId}] Weekend ${satStr}/${sunStr}: inserted=${inserted}`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        invocationId,
        weekendDates,
        inserted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${invocationId}] failed:`, message);
    return new Response(JSON.stringify({ error: message, invocationId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

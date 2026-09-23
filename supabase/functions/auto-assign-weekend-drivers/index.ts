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

  // Canonical office bucket key. Profile offices ("Čačak", "KRAGUJEVAC",
  // "BG 1st/4th floor") and admin cross-office override values ("cacak",
  // "kragujevac", "beograd") must map to the SAME bucket.
  const groupKey = (office: string | null | undefined): string => {
    const s = (office || "").toLowerCase().trim();
    if (!s) return "unknown";
    if (s.includes("cacak") || s.includes("čačak")) return "cacak";
    if (s.includes("beograd") || s.startsWith("bg")) return "beograd";
    if (s.includes("kragujevac")) return "kragujevac";
    return s;
  };

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

  // Runs daily at 01:00 Chicago. We act for any date in afterhours_schedule
  // that is today or tomorrow (Chicago) — so weekends AND holidays both work.
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
    // Candidate dates: today and tomorrow in Chicago. We only act on the
    // ones that actually have entries in afterhours_schedule.
    const todayChicago = `${yyyy}-${mm}-${dd}`;
    const tomorrow = new Date(`${todayChicago}T12:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split("T")[0];
    const candidateDates = [todayChicago, tomorrowStr];

    // --- Fetch scheduled afterhours users for candidate dates ---
    const { data: schedule, error: scheduleErr } = await supabase
      .from("afterhours_schedule")
      .select("user_id, scheduled_date, override_office")
      .in("scheduled_date", candidateDates);
    if (scheduleErr) throw scheduleErr;

    // Only act for dates that are actually scheduled.
    const weekendDates = [
      ...new Set((schedule ?? []).map((s: any) => s.scheduled_date as string)),
    ].sort();

    if (weekendDates.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "no-scheduled-dates", candidateDates }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const dateUsersMap = new Map<string, Set<string>>();
    const allUserIds = new Set<string>();
    // Admin cross-office override: userId -> date -> office they cover.
    const overrideByUserDate = new Map<string, Map<string, string>>();
    (schedule ?? []).filter((s) => s.user_id).forEach((s: any) => {
      allUserIds.add(s.user_id as string);
      if (!dateUsersMap.has(s.scheduled_date)) {
        dateUsersMap.set(s.scheduled_date, new Set());
      }
      dateUsersMap.get(s.scheduled_date)!.add(s.user_id as string);
      if (s.override_office) {
        if (!overrideByUserDate.has(s.user_id)) overrideByUserDate.set(s.user_id, new Map());
        overrideByUserDate.get(s.user_id)!.set(s.scheduled_date, s.override_office);
      }
    });

    // Filter out maintenance and ELD users (they never cover trucks); load offices.
    const userOfficeMap = new Map<string, string | null>();
    if (allUserIds.size > 0) {
      const ids = [...allUserIds];
      const [profilesRes, maintRes] = await Promise.all([
        supabase.from("profiles").select("user_id, office, is_eld").in("user_id", ids),
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "maintenance")
          .in("user_id", ids),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      const maintIds = new Set((maintRes.data ?? []).map((r: any) => r.user_id));
      (profilesRes.data ?? []).forEach((p: any) => {
        if (!maintIds.has(p.user_id) && !p.is_eld) {
          userOfficeMap.set(p.user_id, p.office ?? null);
        }
      });
    }

    // --- Active drivers + their dispatcher offices ---
    const { data: drivers, error: driversErr } = await supabase
      .from("drivers")
      .select("id, dispatcher_id, company_id, is_active")
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

    type EnrichedDriver = {
      id: string;
      dispatcher_id: string | null;
      office: string;
      company_id: string | null;
    };
    const enrichedDrivers: EnrichedDriver[] = (drivers ?? []).map((d: any) => ({
      id: d.id,
      dispatcher_id: d.dispatcher_id ?? null,
      company_id: d.company_id ?? null,
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

    const COMPANY_NONE = "__no_company__";

    /**
     * Company-first allocation: each user keeps their own weekday drivers,
     * then remaining drivers are handed out company block by company block,
     * preferring users who already run that company. Load balance is a soft
     * cap only, so one user may end up with more drivers than another.
     */
    const allocate = (
      userIds: string[],
      officeDriversRaw: EnrichedDriver[],
      carry: Map<string, number>,
      taken: Set<string>,
    ): Map<string, string[]> => {
      const assigned = new Map<string, string[]>();
      const load = new Map<string, number>();
      userIds.forEach((id) => {
        assigned.set(id, []);
        load.set(id, carry.get(id) || 0);
      });
      const officeDrivers = officeDriversRaw.filter((d) => !taken.has(d.id));
      if (userIds.length === 0 || officeDrivers.length === 0) return assigned;
      const baseline = userIds.reduce((s, uid) => s + (load.get(uid) || 0), 0);

      const give = (userId: string, ids: string[]) => {
        const fresh = ids.filter((id) => !taken.has(id));
        fresh.forEach((id) => taken.add(id));
        if (fresh.length === 0) return;
        assigned.get(userId)!.push(...fresh);
        load.set(userId, (load.get(userId) || 0) + fresh.length);
        carry.set(userId, (carry.get(userId) || 0) + fresh.length);
      };


      const own = new Map<string, EnrichedDriver[]>();
      const rest: EnrichedDriver[] = [];
      for (const d of officeDrivers) {
        if (d.dispatcher_id && load.has(d.dispatcher_id)) {
          if (!own.has(d.dispatcher_id)) own.set(d.dispatcher_id, []);
          own.get(d.dispatcher_id)!.push(d);
        } else {
          rest.push(d);
        }
      }
      for (const [uid, ds] of own) give(uid, ds.map((d) => d.id));

      const preferred = new Map<string, string | null>();
      for (const uid of userIds) {
        const counts = new Map<string, number>();
        (own.get(uid) ?? []).forEach((d) => {
          const key = d.company_id || COMPANY_NONE;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
        let best: string | null = null;
        let bestCount = 0;
        for (const [k, c] of counts) {
          if (c > bestCount) { bestCount = c; best = k; }
        }
        preferred.set(uid, best);
      }

      const byCompany = new Map<string, EnrichedDriver[]>();
      rest.forEach((d) => {
        const key = d.company_id || COMPANY_NONE;
        if (!byCompany.has(key)) byCompany.set(key, []);
        byCompany.get(key)!.push(d);
      });

      // Water-filling quotas so totals stay close together, counting what the
      // user already received in an earlier bucket pass this day.
      const total = baseline + officeDrivers.length;
      const quota = new Map<string, number>();
      userIds.forEach((uid) => quota.set(uid, load.get(uid) || 0));
      let placed = userIds.reduce((s, uid) => s + (load.get(uid) || 0), 0);
      while (placed < total) {
        const lowest = userIds.reduce((best, uid) =>
          (quota.get(uid) || 0) < (quota.get(best) || 0) ? uid : best
        );
        quota.set(lowest, (quota.get(lowest) || 0) + 1);
        placed += 1;
      }
      const TOLERANCE = 2;
      const roomFor = (uid: string) =>
        Math.max((quota.get(uid) || 0) + TOLERANCE - (load.get(uid) || 0), 0);

      const blocks = [...byCompany.entries()].sort((a, b) => b[1].length - a[1].length);
      for (const [company, block] of blocks) {
        const pool = [...block];
        while (pool.length > 0) {
          const matching = userIds.filter((uid) => preferred.get(uid) === company && roomFor(uid) > 0);
          let candidates = matching;
          if (candidates.length === 0) candidates = userIds.filter((uid) => roomFor(uid) > 0);
          if (candidates.length === 0) candidates = userIds;

          const target = candidates.reduce((best, uid) =>
            roomFor(uid) > roomFor(best) ? uid : best
          );
          const take = pool.splice(0, Math.max(Math.min(roomFor(target), pool.length), 1));
          give(target, take.map((d) => d.id));
          if (matching.length === 0) preferred.set(target, company);
        }
      }


      return assigned;
    };

    // --- Build per-day distribution ---
    const allRows: { afterhours_user_id: string; driver_id: string; scheduled_date: string }[] = [];

    for (const date of weekendDates) {
      const userIdsForDay = [...(dateUsersMap.get(date) ?? new Set<string>())]
        .filter((uid) => userOfficeMap.has(uid));
      if (userIdsForDay.length === 0) continue;

      // Per-day carry-over: totals and already-taken drivers shared across the
      // office pass and the uncovered pass, so nobody gets a second full share
      // and no driver lands with two people.
      const dayLoad = new Map<string, number>();
      userIdsForDay.forEach((uid) => dayLoad.set(uid, 0));
      const dayTaken = new Set<string>();

      const push = (allocation: Map<string, string[]>) => {
        for (const [uid, driverIds] of allocation) {
          for (const dId of driverIds) {
            allRows.push({ afterhours_user_id: uid, driver_id: dId, scheduled_date: date });
          }
        }
      };

      // Office-based allocation: each covering user only gets drivers of the
      // office they cover that day (admin cross-office override wins over the
      // user's home office). Drivers of offices with nobody on duty are spread
      // across everyone.
      const usersByOffice = new Map<string, string[]>();
      const officeless: string[] = [];
      for (const uid of userIdsForDay) {
        const office = groupKey(
          overrideByUserDate.get(uid)?.get(date) ?? userOfficeMap.get(uid) ?? null,
        );
        if (office === "unknown") {
          officeless.push(uid);
          continue;
        }
        if (!usersByOffice.has(office)) usersByOffice.set(office, []);
        usersByOffice.get(office)!.push(uid);
      }

      // Office-less users join the office carrying the heaviest load per person
      // so they always get a real share instead of an empty bucket.
      for (const uid of officeless) {
        const covered = [...usersByOffice.keys()].filter(
          (office) => (driversByOffice.get(office) ?? []).length > 0,
        );
        if (covered.length === 0) {
          usersByOffice.set("unknown", [...(usersByOffice.get("unknown") ?? []), uid]);
          continue;
        }
        const ratio = (o: string) =>
          (driversByOffice.get(o) ?? []).length / (usersByOffice.get(o)!.length || 1);
        const heaviest = covered.reduce((best, o) => (ratio(o) > ratio(best) ? o : best));
        usersByOffice.get(heaviest)!.push(uid);
      }

      const uncovered: EnrichedDriver[] = [];
      for (const [office, officeDrivers] of driversByOffice) {
        const officeUsers = usersByOffice.get(office);
        if (officeUsers && officeUsers.length > 0) {
          push(allocate(officeUsers, officeDrivers, dayLoad, dayTaken));
        } else {
          uncovered.push(...officeDrivers);
        }
      }
      if (uncovered.length > 0) push(allocate(userIdsForDay, uncovered, dayLoad, dayTaken));
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
      `[${invocationId}] Dates ${weekendDates.join(",")}: inserted=${inserted}`,
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

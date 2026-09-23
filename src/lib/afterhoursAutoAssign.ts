/**
 * Shared allocation logic for weekend (afterhours) and afterhours-shift
 * driver assignments.
 *
 * Goals, in priority order:
 *  1. Each covering user keeps their OWN weekday drivers.
 *  2. Company purity — a covering user should end up with drivers from a
 *     single company whenever possible. Preferred company is derived from
 *     the companies of the user's own weekday drivers.
 *  3. Load balance — respected only as a soft cap, so company purity can
 *     win even if one user ends up with noticeably more drivers.
 */

export interface AllocUser {
  id: string;
  /** Already-normalized office bucket (e.g. "BG"). For cross-office weekend
   *  overrides this is the office the user COVERS that day, not their home office. */
  office: string;
  /** ELD / maintenance people never receive trucks. */
  isEld?: boolean;
}

export interface AllocDriver {
  id: string;
  dispatcher_id: string | null;
  /** Already-normalized office bucket of the driver's weekday dispatcher. */
  office: string;
  company_id: string | null;
}

export interface AllocOptions {
  /** Split per office: covering users only get drivers from the office they cover. */
  bucketByOffice?: boolean;
}

const COMPANY_NONE = '__no_company__';

/**
 * Distributes drivers across users, per office bucket.
 * Returns a map of userId -> assigned driver ids.
 */
export function allocateAfterhoursDrivers(
  users: AllocUser[],
  drivers: AllocDriver[],
  options: AllocOptions = {},
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  users.forEach((u) => result.set(u.id, []));
  // ELD users are on duty but never cover trucks.
  const eligible = users.filter((u) => !u.isEld);
  if (eligible.length === 0 || drivers.length === 0) return result;

  // A driver may never end up with two covering users.
  const takenDrivers = new Set<string>();
  // Totals carried across bucket passes, so the "uncovered offices" pass does
  // not hand a second full share to people who already got an office share.
  const globalLoad = new Map<string, number>();
  eligible.forEach((u) => globalLoad.set(u.id, 0));

  const allocateBucket = (officeUsers: AllocUser[], officeDriversRaw: AllocDriver[]) => {
    const officeDrivers = officeDriversRaw.filter((d) => !takenDrivers.has(d.id));
    if (officeUsers.length === 0 || officeDrivers.length === 0) return;

    const load = new Map<string, number>();
    officeUsers.forEach((u) => load.set(u.id, globalLoad.get(u.id) || 0));
    const baseline = officeUsers.reduce((s, u) => s + (load.get(u.id) || 0), 0);

    const assign = (userId: string, ids: string[]) => {
      const fresh = ids.filter((id) => !takenDrivers.has(id));
      fresh.forEach((id) => takenDrivers.add(id));
      if (fresh.length === 0) return;
      result.get(userId)!.push(...fresh);
      load.set(userId, (load.get(userId) || 0) + fresh.length);
      globalLoad.set(userId, (globalLoad.get(userId) || 0) + fresh.length);
    };


    // 1) Own weekday drivers first.
    const remaining: AllocDriver[] = [];
    const ownDrivers = new Map<string, AllocDriver[]>();
    for (const d of officeDrivers) {
      if (d.dispatcher_id && load.has(d.dispatcher_id)) {
        if (!ownDrivers.has(d.dispatcher_id)) ownDrivers.set(d.dispatcher_id, []);
        ownDrivers.get(d.dispatcher_id)!.push(d);
      } else {
        remaining.push(d);
      }
    }
    for (const [userId, ds] of ownDrivers) {
      assign(userId, ds.map((d) => d.id));
    }

    // 2) Preferred company per user = most common company among own drivers.
    const preferredCompany = new Map<string, string | null>();
    for (const u of officeUsers) {
      const counts = new Map<string, number>();
      (ownDrivers.get(u.id) || []).forEach((d) => {
        const key = d.company_id || COMPANY_NONE;
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      let best: string | null = null;
      let bestCount = 0;
      for (const [key, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          best = key;
        }
      }
      preferredCompany.set(u.id, best);
    }

    // 3) Remaining drivers, company block by company block (largest first),
    //    but each user gets an even quota so totals stay close together.
    const byCompany = new Map<string, AllocDriver[]>();
    remaining.forEach((d) => {
      const key = d.company_id || COMPANY_NONE;
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(d);
    });

    // Water-filling quotas: everyone should end at roughly the same total.
    const total = officeDrivers.length;
    const quota = new Map<string, number>();
    officeUsers.forEach((u) => quota.set(u.id, load.get(u.id) || 0));
    let placed = officeUsers.reduce((s, u) => s + (load.get(u.id) || 0), 0);
    while (placed < total) {
      // Give the next slot to the currently lowest quota holder.
      const target = officeUsers.reduce((best, u) =>
        (quota.get(u.id) || 0) < (quota.get(best.id) || 0) ? u : best,
      );
      quota.set(target.id, (quota.get(target.id) || 0) + 1);
      placed += 1;
    }
    // Small tolerance so a company block does not need to be split over a
    // single driver difference.
    const TOLERANCE = 2;
    const room = (u: AllocUser) =>
      Math.max((quota.get(u.id) || 0) + TOLERANCE - (load.get(u.id) || 0), 0);

    const companyBlocks = [...byCompany.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [company, block] of companyBlocks) {
      const pool = [...block];
      while (pool.length > 0) {
        const matching = officeUsers.filter(
          (u) => preferredCompany.get(u.id) === company && room(u) > 0,
        );
        let candidates = matching;
        if (candidates.length === 0) candidates = officeUsers.filter((u) => room(u) > 0);
        if (candidates.length === 0) candidates = officeUsers;

        // Most room first, so blocks stay together without overloading anyone.
        const target = candidates.reduce((best, u) => (room(u) > room(best) ? u : best));

        const take = pool.splice(0, Math.max(Math.min(room(target), pool.length), 1));
        assign(target.id, take.map((d) => d.id));

        // If nobody has a matching preference for this company, the first
        // recipient adopts it so the rest of the block follows them.
        if (matching.length === 0) preferredCompany.set(target.id, company);
      }
    }

  };

  if (!options.bucketByOffice) {
    // Global allocation: whole fleet split evenly across everyone on duty.
    allocateBucket(eligible, drivers);
    return result;
  }

  // Office allocation: each covering user only gets drivers of the office they
  // cover (cross-office overrides already changed user.office upstream).
  // Users with no office on their profile get no office bucket of their own;
  // they share in the drivers of offices nobody is covering instead.
  const UNKNOWN = 'unknown';
  const usersByOffice = new Map<string, AllocUser[]>();
  eligible
    .filter((u) => u.office && u.office !== UNKNOWN)
    .forEach((u) => {
      if (!usersByOffice.has(u.office)) usersByOffice.set(u.office, []);
      usersByOffice.get(u.office)!.push(u);
    });

  const driversByOffice = new Map<string, AllocDriver[]>();
  drivers.forEach((d) => {
    if (!driversByOffice.has(d.office)) driversByOffice.set(d.office, []);
    driversByOffice.get(d.office)!.push(d);
  });

  // Office-less users join the office that currently carries the heaviest load
  // per person, so they always get a real share instead of an empty bucket.
  const officeless = eligible.filter((u) => !u.office || u.office === UNKNOWN);
  for (const u of officeless) {
    const covered = [...usersByOffice.keys()].filter(
      (office) => (driversByOffice.get(office) || []).length > 0,
    );
    if (covered.length === 0) {
      usersByOffice.set(UNKNOWN, [...(usersByOffice.get(UNKNOWN) || []), u]);
      continue;
    }
    const heaviest = covered.reduce((best, office) => {
      const ratio = (o: string) =>
        (driversByOffice.get(o) || []).length / (usersByOffice.get(o)!.length || 1);
      return ratio(office) > ratio(best) ? office : best;
    });
    usersByOffice.get(heaviest)!.push(u);
  }

  const uncovered: AllocDriver[] = [];
  for (const [office, officeDrivers] of driversByOffice) {
    const officeUsers = usersByOffice.get(office);
    if (officeUsers && officeUsers.length > 0) {
      allocateBucket(officeUsers, officeDrivers);
    } else {
      uncovered.push(...officeDrivers);
    }
  }

  // Offices with nobody on duty (and drivers with no office at all): spread
  // those across everyone on duty.
  if (uncovered.length > 0) allocateBucket(eligible, uncovered);


  return result;
}

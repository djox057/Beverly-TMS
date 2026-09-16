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
  /** Already-normalized office bucket (e.g. "BG"). */
  office: string;
}

export interface AllocDriver {
  id: string;
  dispatcher_id: string | null;
  /** Already-normalized office bucket of the driver's weekday dispatcher. */
  office: string;
  company_id: string | null;
}

const COMPANY_NONE = '__no_company__';

/**
 * Distributes drivers across users, per office bucket.
 * Returns a map of userId -> assigned driver ids.
 */
export function allocateAfterhoursDrivers(
  users: AllocUser[],
  drivers: AllocDriver[],
): Map<string, string[]> {
  const result = new Map<string, string[]>();
  users.forEach((u) => result.set(u.id, []));
  if (users.length === 0 || drivers.length === 0) return result;

  // Bucket by office
  const usersByOffice = new Map<string, AllocUser[]>();
  users.forEach((u) => {
    if (!usersByOffice.has(u.office)) usersByOffice.set(u.office, []);
    usersByOffice.get(u.office)!.push(u);
  });

  const driversByOffice = new Map<string, AllocDriver[]>();
  drivers.forEach((d) => {
    if (!driversByOffice.has(d.office)) driversByOffice.set(d.office, []);
    driversByOffice.get(d.office)!.push(d);
  });

  for (const [office, officeUsers] of usersByOffice) {
    const officeDrivers = driversByOffice.get(office) || [];
    if (officeDrivers.length === 0) continue;

    const load = new Map<string, number>();
    officeUsers.forEach((u) => load.set(u.id, 0));

    const assign = (userId: string, ids: string[]) => {
      result.get(userId)!.push(...ids);
      load.set(userId, (load.get(userId) || 0) + ids.length);
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

    // Soft cap: allows meaningful imbalance in favour of company purity.
    const baseShare = Math.ceil(officeDrivers.length / officeUsers.length);
    const softCap = baseShare + Math.max(2, Math.ceil(baseShare * 0.5));

    // 3) Remaining drivers, company block by company block (largest first).
    const byCompany = new Map<string, AllocDriver[]>();
    remaining.forEach((d) => {
      const key = d.company_id || COMPANY_NONE;
      if (!byCompany.has(key)) byCompany.set(key, []);
      byCompany.get(key)!.push(d);
    });

    const companyBlocks = [...byCompany.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [company, block] of companyBlocks) {
      const pool = [...block];
      while (pool.length > 0) {
        // Prefer users whose company matches; fall back to everyone.
        const matching = officeUsers.filter((u) => preferredCompany.get(u.id) === company);
        const withRoom = (list: AllocUser[]) => list.filter((u) => (load.get(u.id) || 0) < softCap);

        let candidates = withRoom(matching);
        if (candidates.length === 0) candidates = withRoom(officeUsers);
        if (candidates.length === 0) candidates = matching.length > 0 ? matching : officeUsers;

        // Least loaded candidate.
        const target = candidates.reduce((best, u) =>
          (load.get(u.id) || 0) < (load.get(best.id) || 0) ? u : best,
        );

        const room = Math.max(softCap - (load.get(target.id) || 0), 1);
        const take = pool.splice(0, Math.min(room, pool.length));
        assign(target.id, take.map((d) => d.id));

        // If nobody has a matching preference for this company, the first
        // recipient adopts it so the rest of the block follows them.
        if (matching.length === 0) preferredCompany.set(target.id, company);
      }
    }
  }

  return result;
}

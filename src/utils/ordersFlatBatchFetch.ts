import { supabase } from "@/integrations/supabase/client";

/**
 * Batch-fetch rows from a table using .in() queries with automatic batching
 * AND per-batch pagination to avoid the silent Supabase 1000-row return limit.
 *
 * Without explicit .range() pagination, every supabase query is implicitly
 * capped at 1000 rows. For high-fanout child tables like order_files /
 * pickup_drops, a batch of a few hundred order_ids can easily exceed that
 * cap, silently dropping rows (e.g. RC files missing from invoice merges).
 */
async function batchFetchIn(
  table: string,
  column: string,
  ids: string[],
  selectCols: string,
  batchSize = 100
): Promise<any[]> {
  if (ids.length === 0) return [];
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }
  const PAGE_SIZE = 1000;
  const results = await Promise.all(
    batches.map(async (batch) => {
      let all: any[] = [];
      let from = 0;
      // Page until a returned page is shorter than PAGE_SIZE
      // (id ordering keeps results stable across pages).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data, error } = await supabase
          .from(table as any)
          .select(selectCols)
          .in(column, batch)
          .order("id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) {
          console.error(`[batchFetchIn] ${table} page error:`, error);
          break;
        }
        const page = data || [];
        all = all.concat(page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return { data: all };
    })
  );
  return results.flatMap(r => r.data || []);
}

/**
 * Takes flat order rows (no joins) and batch-fetches all relations
 * to produce the full nested shape expected by transformOrders().
 *
 * Eliminates RLS amplification by avoiding lateral joins.
 */
export async function enrichOrdersWithRelations(flatOrders: any[]): Promise<any[]> {
  if (!flatOrders || flatOrders.length === 0) return [];

  const orderIds = flatOrders.map(o => o.id);

  // Stage 1: Batch-fetch child relations by order_id (may exceed 1000 rows total)
  const [pickupDrops, orderFiles, transfers, recoveries] = await Promise.all([
    batchFetchIn("pickup_drops", "order_id", orderIds, "*"),
    batchFetchIn("order_files", "order_id", orderIds, "id, order_id, file_category, file_name, file_path"),
    batchFetchIn("order_transfers", "order_id", orderIds, "*"),
    batchFetchIn("recovery_history", "order_id", orderIds, "*"),
  ]);

  // Build child lookup maps
  const buildChildMap = (items: any[]) => {
    const map = new Map<string, any[]>();
    for (const item of items) {
      const arr = map.get(item.order_id) || [];
      arr.push(item);
      map.set(item.order_id, arr);
    }
    return map;
  };

  const pickupDropsByOrder = buildChildMap(pickupDrops);
  const orderFilesByOrder = buildChildMap(orderFiles);
  const transfersByOrder = buildChildMap(transfers);
  const recoveryByOrder = buildChildMap(recoveries);

  // Stage 2: Collect unique entity IDs
  const brokerIds = new Set<string>();
  const companyIds = new Set<string>();
  const truckIds = new Set<string>();
  const trailerIds = new Set<string>();
  const driverIds = new Set<string>();

  for (const order of flatOrders) {
    if (order.broker_id) brokerIds.add(order.broker_id);
    if (order.company_id) companyIds.add(order.company_id);
    if (order.booked_by_company_id) companyIds.add(order.booked_by_company_id);
    if (order.truck_id) truckIds.add(order.truck_id);
    if (order.trailer_id) trailerIds.add(order.trailer_id);
    if (order.original_truck_id) truckIds.add(order.original_truck_id);
    if (order.original_trailer_id) trailerIds.add(order.original_trailer_id);
    if (order.driver1_id) driverIds.add(order.driver1_id);
    if (order.driver2_id) driverIds.add(order.driver2_id);
    if (order.original_driver1_id) driverIds.add(order.original_driver1_id);
    if (order.original_driver2_id) driverIds.add(order.original_driver2_id);
  }

  // Collect IDs from transfers and recovery_history
  for (const t of transfers) {
    if (t.driver1_id) driverIds.add(t.driver1_id);
    if (t.driver2_id) driverIds.add(t.driver2_id);
    if (t.truck_id) truckIds.add(t.truck_id);
    if (t.trailer_id) trailerIds.add(t.trailer_id);
  }
  for (const r of recoveries) {
    if (r.recovery_driver1_id) driverIds.add(r.recovery_driver1_id);
    if (r.recovery_driver2_id) driverIds.add(r.recovery_driver2_id);
    if (r.recovery_truck_id) truckIds.add(r.recovery_truck_id);
    if (r.recovery_trailer_id) trailerIds.add(r.recovery_trailer_id);
  }

  // Stage 3: Batch-fetch entities (typically <100 unique IDs each)
  const [brokersData, companiesData, trucksData, trailersData, driversData] = await Promise.all([
    brokerIds.size > 0
      ? supabase.from("brokers").select("id, name, mc_number, address").in("id", Array.from(brokerIds)).then(r => r.data || [])
      : Promise.resolve([]),
    companyIds.size > 0
      ? supabase.from("companies").select("id, name").in("id", Array.from(companyIds)).then(r => r.data || [])
      : Promise.resolve([]),
    truckIds.size > 0
      ? supabase.from("trucks").select("id, truck_number, company_id").in("id", Array.from(truckIds)).then(r => r.data || [])
      : Promise.resolve([]),
    trailerIds.size > 0
      ? supabase.from("trailers").select("id, trailer_number").in("id", Array.from(trailerIds)).then(r => r.data || [])
      : Promise.resolve([]),
    driverIds.size > 0
      ? supabase.from("drivers").select("id, name, company_id").in("id", Array.from(driverIds)).then(r => r.data || [])
      : Promise.resolve([]),
  ]);

  // Fetch extra companies for trucks and drivers
  const extraCompanyIds = new Set<string>();
  for (const t of trucksData) {
    if (t.company_id) extraCompanyIds.add(t.company_id);
  }
  for (const d of driversData) {
    if (d.company_id) extraCompanyIds.add(d.company_id);
  }
  for (const c of companiesData) extraCompanyIds.delete(c.id);

  let allCompanies = [...companiesData];
  if (extraCompanyIds.size > 0) {
    const { data: extra } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", Array.from(extraCompanyIds));
    allCompanies = [...allCompanies, ...(extra || [])];
  }

  // Build entity maps
  const brokerMap = new Map<string, any>();
  for (const b of brokersData) brokerMap.set(b.id, b);
  const companyMap = new Map<string, any>();
  for (const c of allCompanies) companyMap.set(c.id, c);
  const truckMap = new Map<string, any>();
  for (const t of trucksData) truckMap.set(t.id, { ...t, company: companyMap.get(t.company_id) || null });
  const trailerMap = new Map<string, any>();
  for (const t of trailersData) trailerMap.set(t.id, t);
  const driverMap = new Map<string, any>();
  for (const d of driversData) driverMap.set(d.id, { ...d, company: companyMap.get(d.company_id) || null });

  // Stage 4: Assemble orders with all relations
  return flatOrders.map(order => {
    const orderTransfers = (transfersByOrder.get(order.id) || [])
      .sort((a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0))
      .map((t: any) => ({
        ...t,
        driver1: driverMap.get(t.driver1_id) || null,
        driver2: driverMap.get(t.driver2_id) || null,
        truck: truckMap.get(t.truck_id) || null,
        trailer: trailerMap.get(t.trailer_id) || null,
      }));

    const orderRecoveries = (recoveryByOrder.get(order.id) || []).map((r: any) => ({
      ...r,
      recovery_driver1: driverMap.get(r.recovery_driver1_id) || null,
      recovery_driver2: driverMap.get(r.recovery_driver2_id) || null,
      recovery_truck: truckMap.get(r.recovery_truck_id) || null,
      recovery_trailer: trailerMap.get(r.recovery_trailer_id) || null,
    }));

    return {
      ...order,
      pickup_drops: (pickupDropsByOrder.get(order.id) || []).sort(
        (a: any, b: any) => (a.sequence_number || 0) - (b.sequence_number || 0)
      ),
      order_files: orderFilesByOrder.get(order.id) || [],
      order_transfers: orderTransfers,
      recovery_history: orderRecoveries,
      broker: brokerMap.get(order.broker_id) || null,
      company: companyMap.get(order.company_id) || null,
      booked_by_company: companyMap.get(order.booked_by_company_id) || null,
      truck: truckMap.get(order.truck_id) || null,
      trailer: trailerMap.get(order.trailer_id) || null,
      driver1: driverMap.get(order.driver1_id) || null,
      driver2: driverMap.get(order.driver2_id) || null,
      original_driver1: driverMap.get(order.original_driver1_id) || null,
      original_driver2: driverMap.get(order.original_driver2_id) || null,
      original_truck: truckMap.get(order.original_truck_id) || null,
      original_trailer: trailerMap.get(order.original_trailer_id) || null,
    };
  });
}

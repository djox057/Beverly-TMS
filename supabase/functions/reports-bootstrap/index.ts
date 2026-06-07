import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ORDER_COLUMNS = `
  id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
  created_at, updated_at, pickup_datetime, pickup_end_datetime, delivery_datetime, delivery_end_datetime,
  canceled, driver1_id, driver2_id, truck_id, trailer_id, broker_id, company_id, booked_by_company_id,
  is_recovery, locked, mileage, loaded_miles, dh_miles, original_driver1_id, original_driver2_id,
  freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
  tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver, booked_by,
  bol_force_complete, pod_force_complete, weight_bol
`;

const PICKUP_DROPS_COLUMNS =
  "id, order_id, type, address, city, state, zip_code, datetime, end_datetime, sequence_number, arrived_at, checked_out_at, going_to_at, latitude, longitude";
const TRANSFER_COLUMNS =
  "id, order_id, sequence_number, driver1_id, driver2_id, truck_id, trailer_id, miles, driver_price, transfer_city, transfer_state, transfer_address, transfer_datetime";
const ORDER_FILES_COLUMNS = "id, order_id, file_category, file_name, file_path";

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function dateOnly(value: string) {
  return String(value || "").slice(0, 10);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10));
}

async function fetchAllOrdersPage(
  supabase: any,
  driverIds: string[],
  startDate: string,
  endDate: string,
  locked: boolean,
) {
  if (driverIds.length === 0) return [];
  const driverIdsStr = driverIds.join(",");
  const allOrders: any[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    let query = supabase
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("locked", locked)
      .or(`driver1_id.in.(${driverIdsStr}),driver2_id.in.(${driverIdsStr})`)
      .or(
        locked
          ? `and(pickup_datetime.gte.${startDate},pickup_datetime.lte.${endDate}T23:59:59),and(delivery_datetime.gte.${startDate},delivery_datetime.lte.${endDate}T23:59:59)`
          : `and(pickup_datetime.gte.${startDate},pickup_datetime.lte.${endDate}T23:59:59),and(delivery_datetime.gte.${startDate},delivery_datetime.lte.${endDate}T23:59:59),status.eq.in_transit,status.eq.pending`,
      )
      .order("pickup_datetime", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (locked) query = query.eq("canceled", false);

    const { data, error } = await query;
    if (error) throw error;
    const rows = data || [];
    allOrders.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return allOrders;
}

async function fetchChildrenForOrders(supabase: any, orderIds: string[]) {
  if (orderIds.length === 0) return { pickupDrops: [], transfers: [], files: [] };
  const chunks = chunk(orderIds, 300);
  const [pickupResults, transferResults, fileResults] = await Promise.all([
    Promise.all(chunks.map((ids) => supabase.from("pickup_drops").select(PICKUP_DROPS_COLUMNS).in("order_id", ids))),
    Promise.all(chunks.map((ids) => supabase.from("order_transfers").select(TRANSFER_COLUMNS).in("order_id", ids))),
    Promise.all(chunks.map((ids) => supabase.from("order_files").select(ORDER_FILES_COLUMNS).in("order_id", ids))),
  ]);

  for (const result of [...pickupResults, ...transferResults, ...fileResults]) {
    if (result.error) throw result.error;
  }

  return {
    pickupDrops: pickupResults.flatMap((r) => r.data || []),
    transfers: transferResults.flatMap((r) => r.data || []),
    files: fileResults.flatMap((r) => r.data || []),
  };
}

function attachChildren(orders: any[], pickupDrops: any[], transfers: any[]) {
  const pdMap = new Map<string, any[]>();
  const transferMap = new Map<string, any[]>();

  for (const pd of pickupDrops) {
    const arr = pdMap.get(pd.order_id) || [];
    arr.push(pd);
    pdMap.set(pd.order_id, arr);
  }
  for (const transfer of transfers) {
    const arr = transferMap.get(transfer.order_id) || [];
    arr.push(transfer);
    transferMap.set(transfer.order_id, arr);
  }

  return orders.map((order) => ({
    ...order,
    pickup_drops: (pdMap.get(order.id) || []).sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)),
    order_transfers: (transferMap.get(order.id) || []).sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)),
  }));
}

function getScope(profiles: any[], drivers: any[], body: any) {
  if (body.individualMode && Array.isArray(body.individualOverrideDriverIds)) {
    return {
      driverIds: body.individualOverrideDriverIds.filter((id: unknown) => typeof id === "string"),
      dispatcherIds: body.currentUserDispatcherId ? [body.currentUserDispatcherId] : [],
    };
  }

  if (body.individualMode && body.currentUserDispatcherId) {
    return {
      driverIds: drivers.filter((d) => d.dispatcher_id === body.currentUserDispatcherId).map((d) => d.id),
      dispatcherIds: [body.currentUserDispatcherId],
    };
  }

  const dispatcherIds = profiles
    .filter((p) => !body.priorityOffice || p.office === body.priorityOffice)
    .map((p) => p.user_id)
    .filter(Boolean);
  const dispatcherSet = new Set(dispatcherIds);
  return {
    driverIds: drivers.filter((d) => d.dispatcher_id && dispatcherSet.has(d.dispatcher_id)).map((d) => d.id),
    dispatcherIds,
  };
}

async function fetchLastLoads(supabase: any, driverIds: string[], orders: any[]) {
  const driversWithOrders = new Set<string>();
  for (const order of orders) {
    if (order.driver1_id) driversWithOrders.add(order.driver1_id);
    if (order.driver2_id) driversWithOrders.add(order.driver2_id);
    for (const transfer of order.order_transfers || []) {
      if (transfer.driver1_id) driversWithOrders.add(transfer.driver1_id);
      if (transfer.driver2_id) driversWithOrders.add(transfer.driver2_id);
    }
  }

  const driversNeedingLastLoad = driverIds.filter((id) => !driversWithOrders.has(id));
  if (driversNeedingLastLoad.length === 0) return { orders: [], files: [], driverIds: [] };

  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .or(`driver1_id.in.(${driversNeedingLastLoad.join(",")}),driver2_id.in.(${driversNeedingLastLoad.join(",")})`)
    .eq("canceled", false)
    .order("delivery_datetime", { ascending: false })
    .limit(driversNeedingLastLoad.length * 3);

  if (error) throw error;

  const lastOrderByDriver = new Map<string, any>();
  for (const order of data || []) {
    if (order.driver1_id && driversNeedingLastLoad.includes(order.driver1_id) && !lastOrderByDriver.has(order.driver1_id)) {
      lastOrderByDriver.set(order.driver1_id, order);
    }
    if (order.driver2_id && driversNeedingLastLoad.includes(order.driver2_id) && !lastOrderByDriver.has(order.driver2_id)) {
      lastOrderByDriver.set(order.driver2_id, order);
    }
  }

  const lastOrders = Array.from(lastOrderByDriver.values());
  const orderIds = lastOrders.map((o) => o.id);
  const children = await fetchChildrenForOrders(supabase, orderIds);
  const enrichedOrders = attachChildren(lastOrders, children.pickupDrops, children.transfers).map((order) => ({
    ...order,
    isLastLoadFallback: true,
  }));

  return { orders: enrichedOrders, files: children.files, driverIds: driversNeedingLastLoad };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    if (!isDateString(body.windowStart) || !isDateString(body.windowEnd)) {
      return json({ error: "windowStart and windowEnd are required as YYYY-MM-DD" }, 400);
    }

    const windowStart = dateOnly(body.windowStart);
    const windowEnd = dateOnly(body.windowEnd);
    const lostDayDates = Array.isArray(body.lostDayDates)
      ? body.lostDayDates.filter(isDateString).map(dateOnly)
      : [];

    const startTime = Date.now();
    const [profilesRes, driversRes, trucksRes, companiesRes, offDutyStatusesRes, truckNotesRes, lostDayNotesRes] =
      await Promise.all([
        supabase.from("profiles").select("user_id, full_name, email, office, ext, created_at"),
        supabase.from("drivers").select("*").eq("is_active", true),
        supabase.from("trucks").select("*").eq("is_active", true),
        supabase.from("companies").select("id, name"),
        supabase.from("dispatcher_status").select("dispatcher_id, inactive_trucks").eq("is_active", false),
        supabase.from("truck_notes").select("*").order("updated_at", { ascending: false }),
        lostDayDates.length > 0
          ? supabase.from("lost_day_notes").select("*").in("date", lostDayDates).order("updated_at", { ascending: false }).range(0, 9999)
          : Promise.resolve({ data: [], error: null }),
      ]);

    for (const result of [profilesRes, driversRes, trucksRes, companiesRes, offDutyStatusesRes, truckNotesRes, lostDayNotesRes]) {
      if (result.error) throw result.error;
    }

    const profiles = profilesRes.data || [];
    const drivers = driversRes.data || [];
    const scope = getScope(profiles, drivers, body);

    const [unlockedOrders, lockedOrders] = await Promise.all([
      fetchAllOrdersPage(supabase, scope.driverIds, windowStart, windowEnd, false),
      fetchAllOrdersPage(supabase, scope.driverIds, windowStart, windowEnd, true),
    ]);

    const unlockedIds = new Set(unlockedOrders.map((o) => o.id));
    const combinedOrders = [...unlockedOrders, ...lockedOrders.filter((o) => !unlockedIds.has(o.id))];
    const orderIds = combinedOrders.map((o) => o.id);
    const children = await fetchChildrenForOrders(supabase, orderIds);
    const orders = attachChildren(combinedOrders, children.pickupDrops, children.transfers);
    const lastLoads = await fetchLastLoads(supabase, scope.driverIds, orders);

    const scopedDriverSet = new Set(scope.driverIds);
    const filteredTrucks = (trucksRes.data || []).filter((t) => scopedDriverSet.has(t.driver1_id) || scopedDriverSet.has(t.driver2_id));
    const trailerIds = Array.from(new Set(filteredTrucks.map((t) => t.trailer_id).filter(Boolean)));
    const dispatchersForScope = Array.from(new Set(drivers.filter((d) => scopedDriverSet.has(d.id) && d.dispatcher_id).map((d) => d.dispatcher_id))).sort();
    const offDutyDispatcherIds = Array.from(new Set((offDutyStatusesRes.data || []).map((s) => s.dispatcher_id).filter(Boolean))).sort();

    const [trailersRes] = await Promise.all([
      trailerIds.length > 0
        ? supabase.from("trailers").select("id, trailer_number, dot_inspection_date, plate_expiration_date, insurance_expiration_date, vin, plate").in("id", trailerIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (trailersRes.error) throw trailersRes.error;

    console.log(`[reports-bootstrap] ${orders.length} orders, ${children.files.length} files, ${scope.driverIds.length} drivers in ${Date.now() - startTime}ms`);

    return json({
      scope,
      profiles,
      userOffice: profiles.find((p) => p.user_id === userData.user.id)?.office || null,
      trucks: trucksRes.data || [],
      trailers: trailersRes.data || [],
      trailerIds,
      drivers,
      dispatchers: profiles.filter((p) => dispatchersForScope.includes(p.user_id)),
      dispatcherIds: dispatchersForScope,
      companies: companiesRes.data || [],
      offDutyStatuses: offDutyStatusesRes.data || [],
      offDutyDispatchers: profiles.filter((p) => offDutyDispatcherIds.includes(p.user_id)),
      offDutyDispatcherIds,
      truckNotes: truckNotesRes.data || [],
      lostDayNotes: lostDayNotesRes.data || [],
      lostDayDates,
      orders,
      orderFiles: children.files,
      lastLoads,
      timings: { totalMs: Date.now() - startTime },
    });
  } catch (error) {
    console.error("[reports-bootstrap] error", error);
    return json({ error: error?.message || "Reports bootstrap failed" }, 500);
  }
});
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { SignJWT, importPKCS8 } from "npm:jose@5.2.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Google Auth ──────────────────────────────────────────────────────────────
async function getGoogleAccessToken(): Promise<string> {
  const raw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY not set");

  const sa = JSON.parse(raw);
  const privateKey = await importPKCS8(sa.private_key, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .sign(privateKey);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token error: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

// ── Google Sheets helpers ────────────────────────────────────────────────────
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsRequest(
  token: string,
  spreadsheetId: string,
  path: string,
  method: string,
  body?: unknown
) {
  const url = `${SHEETS_BASE}/${spreadsheetId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function getExistingSheets(
  token: string,
  spreadsheetId: string
): Promise<{ title: string; sheetId: number }[]> {
  const data = await sheetsRequest(token, spreadsheetId, "?fields=sheets.properties", "GET");
  return (data.sheets || []).map((s: any) => ({
    title: s.properties.title,
    sheetId: s.properties.sheetId,
  }));
}

async function ensureSheetTabs(
  token: string,
  spreadsheetId: string,
  desiredTabs: string[]
): Promise<Map<string, number>> {
  const existing = await getExistingSheets(token, spreadsheetId);
  const existingMap = new Map(existing.map((s) => [s.title, s.sheetId]));
  const requests: any[] = [];

  // Delete tabs not in desired list
  for (const sheet of existing) {
    if (!desiredTabs.includes(sheet.title)) {
      requests.push({ deleteSheet: { sheetId: sheet.sheetId } });
    }
  }

  // Add missing tabs
  let nextId = Math.max(0, ...existing.map((s) => s.sheetId)) + 1;
  for (const tab of desiredTabs) {
    if (!existingMap.has(tab)) {
      requests.push({
        addSheet: { properties: { title: tab, sheetId: nextId } },
      });
      existingMap.set(tab, nextId);
      nextId++;
    }
  }

  if (requests.length > 0) {
    await sheetsRequest(token, spreadsheetId, ":batchUpdate", "POST", { requests });
  }

  // Refresh map after mutations
  const refreshed = await getExistingSheets(token, spreadsheetId);
  return new Map(refreshed.map((s) => [s.title, s.sheetId]));
}

async function clearAndWriteSheet(
  token: string,
  spreadsheetId: string,
  sheetTitle: string,
  rows: string[][]
) {
  // Clear
  await sheetsRequest(
    token,
    spreadsheetId,
    `/values/'${encodeURIComponent(sheetTitle)}'!A:ZZ:clear`,
    "POST"
  );

  if (rows.length === 0) return;

  // Write
  const range = `'${sheetTitle}'!A1`;
  await sheetsRequest(
    token,
    spreadsheetId,
    `/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    "PUT",
    { values: rows }
  );
}

interface RgbColor {
  red: number;
  green: number;
  blue: number;
}

async function applyRowColors(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  rowColors: RgbColor[],
  colCount: number
) {
  if (rowColors.length === 0) return;

  // Batch in groups of 500 to stay within API limits
  const BATCH = 500;
  for (let i = 0; i < rowColors.length; i += BATCH) {
    const slice = rowColors.slice(i, i + BATCH);
    const requests = slice.map((color, idx) => ({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: i + idx + 1, // +1 to skip header
          endRowIndex: i + idx + 2,
          startColumnIndex: 0,
          endColumnIndex: colCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: color.red, green: color.green, blue: color.blue },
          },
        },
        fields: "userEnteredFormat.backgroundColor",
      },
    }));

    await sheetsRequest(token, spreadsheetId, ":batchUpdate", "POST", { requests });
  }
}

async function applyHeaderFormatting(
  token: string,
  spreadsheetId: string,
  sheetId: number,
  colCount: number
) {
  const requests = [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: colCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.95, green: 0.6, blue: 0.1 },
            textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
          },
        },
        fields: "userEnteredFormat(backgroundColor,textFormat)",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
  ];

  await sheetsRequest(token, spreadsheetId, ":batchUpdate", "POST", { requests });
}

// ── Data fetching ────────────────────────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function collectIds(orders: any[], ...fields: string[]): string[] {
  const ids = new Set<string>();
  for (const o of orders) for (const f of fields) if (o[f]) ids.add(o[f]);
  return Array.from(ids);
}

async function batchFetch(
  supabase: any,
  table: string,
  ids: string[],
  cols: string
): Promise<Map<string, any>> {
  if (!ids.length) return new Map();
  const results = await Promise.all(
    chunk(ids, 200).map((c) => supabase.from(table).select(cols).in("id", c))
  );
  const map = new Map<string, any>();
  for (const r of results) {
    if (r.error) { console.error(`Fetch ${table} error:`, r.error.message); continue; }
    for (const item of r.data || []) map.set(item.id, item);
  }
  return map;
}

async function fetchAllUnlockedOrders(supabase: any) {
  const ORDER_COLS = `id, load_number, internal_load_number, broker_load_number, status, notes, date_change_notes,
    pickup_datetime, delivery_datetime, canceled, driver1_id, driver2_id, truck_id, trailer_id,
    broker_id, company_id, booked_by, is_recovery, locked, mileage, loaded_miles, dh_miles,
    freight_amount, driver_price, detention, detention_driver, layover, layover_driver,
    tonu, tonu_driver, extra_stop, extra_stop_driver, lumper, lumper_driver,
    late_fee, late_fee_driver, no_tracking_fee, no_tracking_fee_driver,
    wrong_address_fee, wrong_address_fee_driver, escort_fee,
    other_charges, other_charges_driver, booked_by_company_id`;

  let allOrders: any[] = [];
  let offset = 0;
  const BATCH = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select(ORDER_COLS)
      .eq("locked", false)
      .order("created_at", { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    allOrders = allOrders.concat(data);
    if (data.length < BATCH) break;
    offset += BATCH;
  }

  // Fetch pickup_drops
  const orderIds = allOrders.map((o: any) => o.id);
  if (orderIds.length > 0) {
    const pdResults = await Promise.all(
      chunk(orderIds, 200).map((c) =>
        supabase
          .from("pickup_drops")
          .select("id, order_id, type, city, state, datetime, sequence_number")
          .in("order_id", c)
      )
    );
    const pdMap = new Map<string, any[]>();
    for (const r of pdResults) {
      for (const pd of r.data || []) {
        const arr = pdMap.get(pd.order_id);
        if (arr) arr.push(pd);
        else pdMap.set(pd.order_id, [pd]);
      }
    }
    for (const o of allOrders) o.pickup_drops = pdMap.get(o.id) || [];
  }

  // Fetch entities
  const truckIds = collectIds(allOrders, "truck_id");
  const driverIds = collectIds(allOrders, "driver1_id", "driver2_id");
  const brokerIds = collectIds(allOrders, "broker_id");
  const companyIds = collectIds(allOrders, "company_id", "booked_by_company_id");
  const trailerIds = collectIds(allOrders, "trailer_id");

  const [trucksMap, driversMap, brokersMap, companiesMap, trailersMap] = await Promise.all([
    batchFetch(supabase, "trucks", truckIds, "id, truck_number, company_id, dispatcher_id"),
    batchFetch(supabase, "drivers", driverIds, "id, name, company_id, home_city, home_state, dispatcher_id"),
    batchFetch(supabase, "brokers", brokerIds, "id, name"),
    batchFetch(supabase, "companies", companyIds, "id, name"),
    batchFetch(supabase, "trailers", trailerIds, "id, trailer_number"),
  ]);

  // Enrich trucks/drivers with company
  for (const [, truck] of trucksMap) {
    if (truck.company_id && companiesMap.has(truck.company_id)) truck.company = companiesMap.get(truck.company_id);
  }
  for (const [, driver] of driversMap) {
    if (driver.company_id && companiesMap.has(driver.company_id)) driver.company = companiesMap.get(driver.company_id);
  }

  // Fetch dispatcher names (profiles)
  const dispatcherIds = new Set<string>();
  for (const [, truck] of trucksMap) if (truck.dispatcher_id) dispatcherIds.add(truck.dispatcher_id);
  for (const [, driver] of driversMap) if (driver.dispatcher_id) dispatcherIds.add(driver.dispatcher_id);
  // Also add booked_by IDs
  for (const o of allOrders) if (o.booked_by) dispatcherIds.add(o.booked_by);

  const dispatcherIdsArr = Array.from(dispatcherIds);
  const profilesMap = new Map<string, string>();
  if (dispatcherIdsArr.length > 0) {
    const profileResults = await Promise.all(
      chunk(dispatcherIdsArr, 200).map((c) =>
        supabase.from("profiles").select("user_id, full_name").in("user_id", c)
      )
    );
    for (const r of profileResults) {
      for (const p of r.data || []) profilesMap.set(p.user_id, p.full_name || "");
    }
  }

  // Attach entities to orders
  for (const order of allOrders) {
    order.truck = trucksMap.get(order.truck_id) || null;
    order.trailer = trailersMap.get(order.trailer_id) || null;
    order.driver1 = driversMap.get(order.driver1_id) || null;
    order.driver2 = driversMap.get(order.driver2_id) || null;
    order.broker = brokersMap.get(order.broker_id) || null;
    order.company = companiesMap.get(order.company_id) || null;
    order.booked_by_company = companiesMap.get(order.booked_by_company_id) || null;
  }

  return { allOrders, profilesMap };
}

// ── Transform helpers ────────────────────────────────────────────────────────
const toNum = (val: any): number => {
  if (val === null || val === undefined || val === "" || val === "null") return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

function formatDateTimeForSheet(dt: string | null): string {
  if (!dt) return "";
  try {
    const d = new Date(dt.replace(" ", "T"));
    if (isNaN(d.getTime())) return dt || "";
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day}/${d.getFullYear()} ${h}:${min}`;
  } catch {
    return dt || "";
  }
}

function formatDateForSheet(dt: string | null): string {
  if (!dt) return "";
  try {
    const d = new Date(dt.replace(" ", "T"));
    if (isNaN(d.getTime())) return dt || "";
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${m}/${day}/${d.getFullYear()}`;
  } catch {
    return dt || "";
  }
}

// ── Build Trips rows ─────────────────────────────────────────────────────────
function buildTripsData(orders: any[]) {
  // Group by company
  const groups = new Map<string, any[]>();
  for (const o of orders) {
    const companyName = o.company?.name || o.truck?.company?.name || "Unknown";
    const arr = groups.get(companyName);
    if (arr) arr.push(o);
    else groups.set(companyName, [o]);
  }

  const HEADER = [
    "Truck #", "Driver", "Load #", "Pickup Date", "Pickup City",
    "Delivery Date", "Delivery City", "Miles", "Broker Name",
    "Broker Load #", "Driver Pay", "Freight Amt",
  ];

  const result: { tab: string; rows: string[][]; colors: RgbColor[] }[] = [];

  for (const [companyName, companyOrders] of groups) {
    const rows: string[][] = [HEADER];
    const colors: RgbColor[] = [];

    for (let i = 0; i < companyOrders.length; i++) {
      const o = companyOrders[i];
      const pickups = (o.pickup_drops || []).filter((pd: any) => pd.type === "pickup");
      const deliveries = (o.pickup_drops || []).filter((pd: any) => pd.type === "delivery" || pd.type === "drop");
      const firstPickup = pickups[0];
      const lastDelivery = deliveries[deliveries.length - 1];

      const freightAmount = toNum(o.freight_amount);
      const totalFreightNoLumper =
        freightAmount +
        toNum(o.detention) + toNum(o.layover) + toNum(o.tonu) +
        toNum(o.extra_stop) + toNum(o.escort_fee) -
        toNum(o.late_fee) - toNum(o.no_tracking_fee) -
        toNum(o.wrong_address_fee) - toNum(o.other_charges);

      const totalDriverPay =
        toNum(o.driver_price) +
        toNum(o.detention_driver) + toNum(o.layover_driver) +
        toNum(o.tonu_driver) + toNum(o.extra_stop_driver) +
        toNum(o.lumper_driver) -
        toNum(o.late_fee_driver) - toNum(o.no_tracking_fee_driver) -
        toNum(o.wrong_address_fee_driver) + toNum(o.other_charges_driver);

      const miles = toNum(o.loaded_miles) + toNum(o.dh_miles);

      rows.push([
        o.truck?.truck_number || "",
        o.driver1?.name || "",
        o.load_number || "",
        formatDateForSheet(firstPickup?.datetime || o.pickup_datetime),
        firstPickup ? `${firstPickup.city || ""}, ${firstPickup.state || ""}` : "",
        formatDateForSheet(lastDelivery?.datetime || o.delivery_datetime),
        lastDelivery ? `${lastDelivery.city || ""}, ${lastDelivery.state || ""}` : "",
        miles ? String(miles) : "",
        o.broker?.name || "",
        o.broker_load_number || "",
        totalDriverPay ? `$${totalDriverPay.toFixed(2)}` : "",
        totalFreightNoLumper ? `$${totalFreightNoLumper.toFixed(2)}` : "",
      ]);

      // Color logic matching Trips.tsx lines 4922-4948
      const isRecovery = o.is_recovery === true;
      const hasReducedPay = totalFreightNoLumper < freightAmount && freightAmount > 0;
      const hasAdditionalPay = totalFreightNoLumper > freightAmount;
      const hasOrange = o.canceled === true ||
        (o.date_change_notes && String(o.date_change_notes).trim() !== "");
      const isEven = i % 2 === 1;

      if (isRecovery) {
        colors.push({ red: 0.85, green: 0.75, blue: 0.95 });
      } else if (hasReducedPay) {
        colors.push({ red: 0.95, green: 0.8, blue: 0.8 });
      } else if (hasAdditionalPay) {
        colors.push({ red: 0.8, green: 0.95, blue: 0.8 });
      } else if (hasOrange) {
        colors.push({ red: 0.95, green: 0.88, blue: 0.8 });
      } else if (isEven) {
        colors.push({ red: 0.96, green: 0.96, blue: 0.96 });
      } else {
        colors.push({ red: 1, green: 1, blue: 1 });
      }
    }

    result.push({ tab: companyName, rows, colors });
  }

  return result;
}

// ── Build Reports rows ───────────────────────────────────────────────────────
function buildReportsData(orders: any[], profilesMap: Map<string, string>) {
  const HEADER = [
    "Truck #", "Driver", "Home", "Dispatch Name",
    "Pickup City, State", "Pickup DateTime",
    "Delivery City, State", "Delivery DateTime", "Note",
  ];

  const rows: string[][] = [HEADER];

  for (const o of orders) {
    const pickups = (o.pickup_drops || []).filter((pd: any) => pd.type === "pickup");
    const deliveries = (o.pickup_drops || []).filter((pd: any) => pd.type === "delivery" || pd.type === "drop");
    const firstPickup = pickups[0];
    const lastDelivery = deliveries[deliveries.length - 1];

    const driver = o.driver1;
    const home = driver ? `${driver.home_city || ""}, ${driver.home_state || ""}`.replace(/^, |, $/g, "") : "";

    // Dispatcher name: from driver's dispatcher_id, or truck's dispatcher_id, or booked_by
    const dispatcherId = driver?.dispatcher_id || o.truck?.dispatcher_id || o.booked_by;
    const dispatchName = dispatcherId ? (profilesMap.get(dispatcherId) || "") : "";

    rows.push([
      o.truck?.truck_number || "",
      driver?.name || "",
      home,
      dispatchName,
      firstPickup ? `${firstPickup.city || ""}, ${firstPickup.state || ""}` : "",
      formatDateTimeForSheet(firstPickup?.datetime || o.pickup_datetime),
      lastDelivery ? `${lastDelivery.city || ""}, ${lastDelivery.state || ""}` : "",
      formatDateTimeForSheet(lastDelivery?.datetime || o.delivery_datetime),
      o.notes || "",
    ]);
  }

  return rows;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    console.log("[sync-google-sheets] Starting sync...");

    const tripsSheetId = Deno.env.get("GOOGLE_SHEETS_TRIPS_ID");
    const reportsSheetId = Deno.env.get("GOOGLE_SHEETS_REPORTS_ID");
    if (!tripsSheetId || !reportsSheetId) {
      throw new Error("Missing GOOGLE_SHEETS_TRIPS_ID or GOOGLE_SHEETS_REPORTS_ID");
    }

    // Auth
    const token = await getGoogleAccessToken();
    console.log("[sync-google-sheets] Google auth OK");

    // Fetch data
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { allOrders, profilesMap } = await fetchAllUnlockedOrders(supabase);
    console.log(`[sync-google-sheets] Fetched ${allOrders.length} orders`);

    // ── Trips Sheet ──
    const tripsData = buildTripsData(allOrders);
    const tripsTabs = tripsData.map((d) => d.tab);

    if (tripsTabs.length > 0) {
      const tabMap = await ensureSheetTabs(token, tripsSheetId, tripsTabs);

      for (const group of tripsData) {
        await clearAndWriteSheet(token, tripsSheetId, group.tab, group.rows);

        const sheetId = tabMap.get(group.tab);
        if (sheetId !== undefined) {
          await applyHeaderFormatting(token, tripsSheetId, sheetId, 12);
          await applyRowColors(token, tripsSheetId, sheetId, group.colors, 12);
        }
      }
    }

    console.log("[sync-google-sheets] Trips sheet synced");

    // ── Reports Sheet ──
    const reportsRows = buildReportsData(allOrders, profilesMap);
    const reportsTabMap = await ensureSheetTabs(token, reportsSheetId, ["All Orders"]);
    await clearAndWriteSheet(token, reportsSheetId, "All Orders", reportsRows);

    const reportsTabId = reportsTabMap.get("All Orders");
    if (reportsTabId !== undefined) {
      await applyHeaderFormatting(token, reportsSheetId, reportsTabId, 9);
    }

    console.log("[sync-google-sheets] Reports sheet synced");

    const elapsed = Date.now() - startTime;
    console.log(`[sync-google-sheets] Complete in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        ordersCount: allOrders.length,
        tripsTabCount: tripsTabs.length,
        elapsedMs: elapsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync-google-sheets] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Coord { lat: number; lng: number }

interface Body {
  scope?: "global" | "filtered";
  pickup?: Coord | null;
  delivery?: Coord | null;
  pickupRadius?: number | null;
  deliveryRadius?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  minRepeats?: number;
}

// ~1 mile grid cell key
function cellKey(lat: number, lng: number): string {
  const latCell = Math.round(lat * 69);
  const lngCell = Math.round(lng * 69 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return `${latCell}:${lngCell}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const db = createClient(supabaseUrl, serviceKey);
    const { data: roles } = await db
      .from("user_roles").select("role").eq("user_id", userData.user.id);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const scope = body.scope === "filtered" ? "filtered" : "global";
    const pickup = body.pickup ?? null;
    const delivery = body.delivery ?? null;
    const pickupRadius = Math.max(0.1, Number(body.pickupRadius) || 1);
    const deliveryRadius = Math.max(0.1, Number(body.deliveryRadius) || 1);
    const minRepeats = Math.max(2, Math.min(20, Number(body.minRepeats) || 3));
    const dateFrom = body.dateFrom || null;
    const dateTo = body.dateTo || null;

    if (scope === "filtered" && !pickup && !delivery) {
      return new Response(JSON.stringify({ error: "pickup or delivery required for filtered scope" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateToExclusive = dateTo
      ? (() => { const d = new Date(dateTo); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().split("T")[0]; })()
      : null;

    // Fetch orders (paginated)
    interface Ord {
      id: string; broker_id: string;
      freight_amount: number | null; loaded_miles: number | null;
      pickup_datetime: string | null;
      brokers: { name: string | null; mc_number: string | null } | null;
    }
    const orders: Ord[] = [];
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      let q = db
        .from("orders")
        .select("id, broker_id, freight_amount, loaded_miles, pickup_datetime, brokers ( name, mc_number )")
        .eq("canceled", false)
        .not("broker_id", "is", null);
      if (dateFrom) q = q.gte("pickup_datetime", dateFrom);
      if (dateToExclusive) q = q.lt("pickup_datetime", dateToExclusive);
      const { data, error } = await q.order("pickup_datetime", { ascending: false }).range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      orders.push(...(data as any[]));
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    if (orders.length === 0) {
      return new Response(JSON.stringify({ lanes: [], truncated: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all pickup_drops for these orders in 200-id chunks
    const ids = orders.map(o => o.id);
    interface Stop { order_id: string; type: string | null; sequence_number: number | null;
      latitude: number | null; longitude: number | null; city: string | null; state: string | null; }
    const stops: Stop[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { data, error } = await db
        .from("pickup_drops")
        .select("order_id, type, sequence_number, latitude, longitude, city, state")
        .in("order_id", chunk);
      if (error) throw error;
      if (data) stops.push(...(data as any[]));
    }

    // Per order: first pickup + last delivery
    interface Endpoints { pLat: number; pLng: number; pCity: string; pState: string;
      dLat: number; dLng: number; dCity: string; dState: string; }
    const endpoints = new Map<string, Endpoints>();
    const byOrder = new Map<string, Stop[]>();
    for (const s of stops) {
      if (!byOrder.has(s.order_id)) byOrder.set(s.order_id, []);
      byOrder.get(s.order_id)!.push(s);
    }
    for (const [oid, arr] of byOrder) {
      const pickups = arr.filter(s => s.type === "pickup" && s.latitude != null && s.longitude != null)
        .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
      const dels = arr.filter(s => s.type === "delivery" && s.latitude != null && s.longitude != null)
        .sort((a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0));
      const p = pickups[0]; const d = dels[dels.length - 1];
      if (!p || !d) continue;
      endpoints.set(oid, {
        pLat: Number(p.latitude), pLng: Number(p.longitude),
        pCity: p.city || "", pState: p.state || "",
        dLat: Number(d.latitude), dLng: Number(d.longitude),
        dCity: d.city || "", dState: d.state || "",
      });
    }

    // Window for trend: dateTo or today is the anchor; last 30 / prior 30
    const anchorDate = dateTo ? new Date(dateTo) : new Date();
    const last30Start = new Date(anchorDate); last30Start.setUTCDate(last30Start.getUTCDate() - 30);
    const prior30Start = new Date(last30Start); prior30Start.setUTCDate(prior30Start.getUTCDate() - 30);

    interface LaneAgg {
      broker_id: string; broker_name: string; broker_mc: string;
      pickupKey: string; deliveryKey: string;
      pickupCities: Map<string, number>; deliveryCities: Map<string, number>;
      freightSum: number; milesSum: number; count: number;
      last30FreightSum: number; last30MilesSum: number; last30Count: number;
      prior30FreightSum: number; prior30MilesSum: number; prior30Count: number;
      order_ids: string[];
    }
    const lanes = new Map<string, LaneAgg>();

    for (const o of orders) {
      const ep = endpoints.get(o.id);
      if (!ep) continue;
      if (scope === "filtered") {
        if (pickup && haversine(pickup.lat, pickup.lng, ep.pLat, ep.pLng) > pickupRadius) continue;
        if (delivery && haversine(delivery.lat, delivery.lng, ep.dLat, ep.dLng) > deliveryRadius) continue;
      }
      const pk = cellKey(ep.pLat, ep.pLng);
      const dk = cellKey(ep.dLat, ep.dLng);
      const key = `${o.broker_id}|${pk}|${dk}`;
      let lane = lanes.get(key);
      if (!lane) {
        lane = {
          broker_id: o.broker_id,
          broker_name: o.brokers?.name || "Unknown",
          broker_mc: o.brokers?.mc_number || "",
          pickupKey: pk, deliveryKey: dk,
          pickupCities: new Map(), deliveryCities: new Map(),
          freightSum: 0, milesSum: 0, count: 0,
          last30FreightSum: 0, last30MilesSum: 0, last30Count: 0,
          prior30FreightSum: 0, prior30MilesSum: 0, prior30Count: 0,
          order_ids: [],
        };
        lanes.set(key, lane);
      }
      const f = Number(o.freight_amount) || 0;
      const m = Number(o.loaded_miles) || 0;
      lane.freightSum += f; lane.milesSum += m; lane.count++;
      lane.order_ids.push(o.id);
      const pCityKey = `${ep.pCity}|${ep.pState}`;
      const dCityKey = `${ep.dCity}|${ep.dState}`;
      lane.pickupCities.set(pCityKey, (lane.pickupCities.get(pCityKey) || 0) + 1);
      lane.deliveryCities.set(dCityKey, (lane.deliveryCities.get(dCityKey) || 0) + 1);
      if (o.pickup_datetime) {
        const pd = new Date(o.pickup_datetime);
        if (pd >= last30Start && pd <= anchorDate) {
          lane.last30FreightSum += f; lane.last30MilesSum += m; lane.last30Count++;
        } else if (pd >= prior30Start && pd < last30Start) {
          lane.prior30FreightSum += f; lane.prior30MilesSum += m; lane.prior30Count++;
        }
      }
    }

    // Build output, keep only lanes with count >= minRepeats
    const mode = (m: Map<string, number>) => {
      let best = ""; let bestCt = -1;
      for (const [k, v] of m) if (v > bestCt) { bestCt = v; best = k; }
      const [c, s] = best.split("|");
      return { city: c || "?", state: s || "?" };
    };
    const result = [] as any[];
    for (const lane of lanes.values()) {
      if (lane.count < minRepeats) continue;
      const avg_freight = lane.freightSum / lane.count;
      const avg_miles = lane.milesSum / lane.count;
      const avg_rpm = lane.milesSum > 0 ? lane.freightSum / lane.milesSum : 0;
      const last30_rpm = lane.last30MilesSum > 0 ? lane.last30FreightSum / lane.last30MilesSum : 0;
      const prior30_rpm = lane.prior30MilesSum > 0 ? lane.prior30FreightSum / lane.prior30MilesSum : 0;
      const trend_pct = prior30_rpm > 0 && last30_rpm > 0 ? (last30_rpm - prior30_rpm) / prior30_rpm : null;
      const expected_rpm = last30_rpm > 0 ? last30_rpm : avg_rpm;
      const expected_rate = expected_rpm > 0 && avg_miles > 0 ? expected_rpm * avg_miles : 0;
      const p = mode(lane.pickupCities);
      const d = mode(lane.deliveryCities);
      result.push({
        broker_id: lane.broker_id,
        broker_name: lane.broker_name,
        broker_mc: lane.broker_mc,
        pickup_city: p.city, pickup_state: p.state,
        delivery_city: d.city, delivery_state: d.state,
        load_count: lane.count,
        avg_freight, avg_miles, avg_rpm,
        last30_rpm, prior30_rpm,
        last30_count: lane.last30Count, prior30_count: lane.prior30Count,
        trend_pct, expected_rpm, expected_rate,
        order_ids: lane.order_ids,
      });
    }
    result.sort((a, b) => b.load_count - a.load_count);
    const capped = result.slice(0, 500);

    return new Response(JSON.stringify({ lanes: capped, truncated: false, scanned: orders.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lane-deep-search error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
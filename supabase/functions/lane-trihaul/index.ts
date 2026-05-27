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
  pickup: Coord;
  delivery: Coord;
  pickupRadius?: number;
  deliveryRadius?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  topN?: number;
}

function bbox(c: Coord, miles: number) {
  const dLat = miles / 69;
  const dLng = miles / (69 * Math.max(0.01, Math.cos((c.lat * Math.PI) / 180)));
  return {
    minLat: c.lat - dLat,
    maxLat: c.lat + dLat,
    minLng: c.lng - dLng,
    maxLng: c.lng + dLng,
  };
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
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.pickup || !body.delivery) {
      return new Response(JSON.stringify({ error: "pickup and delivery required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const pickup = body.pickup;
    const delivery = body.delivery;
    const pickupRadius = Math.max(0, Math.min(450, Number(body.pickupRadius) || 60));
    const deliveryRadius = Math.max(0, Math.min(450, Number(body.deliveryRadius) || 60));
    const dateFrom = body.dateFrom || null;
    const dateTo = body.dateTo || null;
    const topN = Math.max(5, Math.min(100, Number(body.topN) || 25));

    const dateToExclusive = dateTo
      ? (() => { const d = new Date(dateTo); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().split("T")[0]; })()
      : null;

    // Find pickup_drops matching a coord within a bbox/radius, filtered by stop type
    async function fetchStops(coord: Coord, radius: number, type: "pickup" | "delivery", applyDate: boolean) {
      const b = bbox(coord, radius);
      const acc: { order_id: string; latitude: number; longitude: number }[] = [];
      const PAGE = 1000;
      let offset = 0;
      while (true) {
        let q = db
          .from("pickup_drops")
          .select("order_id, latitude, longitude, datetime")
          .eq("type", type)
          .gte("latitude", b.minLat).lte("latitude", b.maxLat)
          .gte("longitude", b.minLng).lte("longitude", b.maxLng);
        if (applyDate && dateFrom) q = q.gte("datetime", dateFrom);
        if (applyDate && dateToExclusive) q = q.lt("datetime", dateToExclusive);
        const { data, error } = await q.range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const s of data) {
          if (s.latitude == null || s.longitude == null) continue;
          const lat = Number(s.latitude), lng = Number(s.longitude);
          if (haversine(coord.lat, coord.lng, lat, lng) <= radius) {
            acc.push({ order_id: s.order_id, latitude: lat, longitude: lng });
          }
        }
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      return acc;
    }

    // Leg 1: orders picked up near A (apply date filter to leg 1)
    // Leg 2: orders delivered near B (no date restriction)
    const [leg1PickupStops, leg2DeliveryStops] = await Promise.all([
      fetchStops(pickup, pickupRadius, "pickup", true),
      fetchStops(delivery, deliveryRadius, "delivery", false),
    ]);

    const leg1OrderIds = [...new Set(leg1PickupStops.map(s => s.order_id))];
    const leg2OrderIds = [...new Set(leg2DeliveryStops.map(s => s.order_id))];

    if (leg1OrderIds.length === 0 || leg2OrderIds.length === 0) {
      return new Response(JSON.stringify({ combos: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch order rows for both legs
    async function fetchOrders(ids: string[]) {
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        let q = db
          .from("orders")
          .select("id, freight_amount, loaded_miles, pickup_datetime")
          .in("id", chunk)
          .eq("canceled", false)
          .not("broker_id", "is", null);
        const { data, error } = await q;
        if (error) throw error;
        if (data) out.push(...data);
      }
      return out;
    }

    const [leg1Orders, leg2Orders] = await Promise.all([
      fetchOrders(leg1OrderIds),
      fetchOrders(leg2OrderIds),
    ]);
    const leg1OrdersMap = new Map(leg1Orders.map(o => [o.id, o]));
    const leg2OrdersMap = new Map(leg2Orders.map(o => [o.id, o]));

    // Apply date filter to leg 1 orders by pickup_datetime
    const leg1ValidIds = new Set(
      leg1Orders
        .filter(o => {
          if (!dateFrom && !dateToExclusive) return true;
          if (!o.pickup_datetime) return false;
          const pd = o.pickup_datetime.split("T")[0];
          if (dateFrom && pd < dateFrom) return false;
          if (dateToExclusive && pd >= dateToExclusive) return false;
          return true;
        })
        .map(o => o.id)
    );
    const leg2ValidIds = new Set(leg2Orders.map(o => o.id));

    // Fetch ALL stops for leg1 + leg2 orders to determine intermediate cities
    // For leg 1 → use last delivery stop as endpoint
    // For leg 2 → use first pickup stop as origin
    const allIds = [...new Set([...leg1ValidIds, ...leg2ValidIds])];
    const stopsByOrder = new Map<string, { type: string; city: string | null; state: string | null; latitude: number | null; longitude: number | null; sequence_number: number | null }[]>();
    for (let i = 0; i < allIds.length; i += 200) {
      const chunk = allIds.slice(i, i + 200);
      const { data, error } = await db
        .from("pickup_drops")
        .select("order_id, type, city, state, latitude, longitude, sequence_number")
        .in("order_id", chunk)
        .order("sequence_number", { ascending: true });
      if (error) throw error;
      for (const s of data || []) {
        if (!stopsByOrder.has(s.order_id)) stopsByOrder.set(s.order_id, []);
        stopsByOrder.get(s.order_id)!.push(s as any);
      }
    }

    // Build leg1 endpoints (where leg 1 ends)
    interface Endpoint { city: string; state: string; lat: number; lng: number }
    const norm = (c?: string | null, s?: string | null) => `${(c || "").trim().toUpperCase()}|${(s || "").trim().toUpperCase()}`;

    interface ClusterAgg {
      key: string;
      city: string;
      state: string;
      lat: number;
      lng: number;
      orders: { id: string; freight: number; miles: number }[];
    }
    const leg1Clusters = new Map<string, ClusterAgg>();
    const leg2Clusters = new Map<string, ClusterAgg>();

    for (const id of leg1ValidIds) {
      const o = leg1OrdersMap.get(id);
      if (!o) continue;
      const stops = stopsByOrder.get(id) || [];
      const deliveries = stops.filter(s => s.type === "delivery");
      const last = deliveries[deliveries.length - 1];
      if (!last || !last.city || !last.state) continue;
      const key = norm(last.city, last.state);
      if (!key || key === "|") continue;
      let c = leg1Clusters.get(key);
      if (!c) {
        c = { key, city: last.city, state: last.state, lat: Number(last.latitude) || 0, lng: Number(last.longitude) || 0, orders: [] };
        leg1Clusters.set(key, c);
      }
      c.orders.push({ id, freight: Number(o.freight_amount) || 0, miles: Number(o.loaded_miles) || 0 });
    }

    for (const id of leg2ValidIds) {
      const o = leg2OrdersMap.get(id);
      if (!o) continue;
      const stops = stopsByOrder.get(id) || [];
      const pickups = stops.filter(s => s.type === "pickup");
      const first = pickups[0];
      if (!first || !first.city || !first.state) continue;
      const key = norm(first.city, first.state);
      if (!key || key === "|") continue;
      let c = leg2Clusters.get(key);
      if (!c) {
        c = { key, city: first.city, state: first.state, lat: Number(first.latitude) || 0, lng: Number(first.longitude) || 0, orders: [] };
        leg2Clusters.set(key, c);
      }
      c.orders.push({ id, freight: Number(o.freight_amount) || 0, miles: Number(o.loaded_miles) || 0 });
    }

    // Intersect: cities present in both
    const combos: any[] = [];
    for (const [key, l1] of leg1Clusters) {
      const l2 = leg2Clusters.get(key);
      if (!l2) continue;

      const l1Count = l1.orders.length;
      const l2Count = l2.orders.length;
      const l1Freight = l1.orders.reduce((s, o) => s + o.freight, 0);
      const l2Freight = l2.orders.reduce((s, o) => s + o.freight, 0);
      const l1Miles = l1.orders.reduce((s, o) => s + o.miles, 0);
      const l2Miles = l2.orders.reduce((s, o) => s + o.miles, 0);

      const avg1F = l1Count > 0 ? l1Freight / l1Count : 0;
      const avg2F = l2Count > 0 ? l2Freight / l2Count : 0;
      const avg1M = l1Count > 0 ? l1Miles / l1Count : 0;
      const avg2M = l2Count > 0 ? l2Miles / l2Count : 0;
      const totalF = avg1F + avg2F;
      const totalM = avg1M + avg2M;

      combos.push({
        intermediate: { city: l1.city, state: l1.state, lat: l1.lat, lng: l1.lng },
        leg1: {
          avg_freight: avg1F,
          avg_miles: avg1M,
          rpm: avg1M > 0 ? avg1F / avg1M : 0,
          count: l1Count,
          order_ids: l1.orders.map(o => o.id),
        },
        leg2: {
          avg_freight: avg2F,
          avg_miles: avg2M,
          rpm: avg2M > 0 ? avg2F / avg2M : 0,
          count: l2Count,
          order_ids: l2.orders.map(o => o.id),
        },
        total_freight: totalF,
        total_miles: totalM,
        combined_rpm: totalM > 0 ? totalF / totalM : 0,
      });
    }

    combos.sort((a, b) => b.total_freight - a.total_freight);

    return new Response(JSON.stringify({ combos: combos.slice(0, topN) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lane-trihaul error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
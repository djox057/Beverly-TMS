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
  pickup?: Coord | null;
  delivery?: Coord | null;
  pickupRadius?: number;
  deliveryRadius?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
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

    // Auth: require authenticated user with admin/manager role
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
    const allowed = roles?.some((r: any) =>
      r.role === "admin" || r.role === "manager" || r.role === "dispatch"
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const pickup = body.pickup ?? null;
    const delivery = body.delivery ?? null;
    const pickupRadius = Math.max(0, Math.min(450, Number(body.pickupRadius) || 60));
    const deliveryRadius = Math.max(0, Math.min(450, Number(body.deliveryRadius) || 60));
    const dateFrom = body.dateFrom || null;
    const dateTo = body.dateTo || null;

    if (!pickup && !delivery) {
      return new Response(JSON.stringify({ error: "pickup or delivery required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dateToExclusive = dateTo
      ? (() => { const d = new Date(dateTo); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().split("T")[0]; })()
      : null;

    // Helper: paginate a stop query
    async function fetchStops(coord: Coord, radius: number, type: "pickup" | "delivery") {
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
        // Use stop datetime when filtering pickup-side; delivery-side stop datetime can lag, so don't restrict
        if (type === "pickup" && dateFrom) q = q.gte("datetime", dateFrom);
        if (type === "pickup" && dateToExclusive) q = q.lt("datetime", dateToExclusive);
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

    const [pickupStops, deliveryStops] = await Promise.all([
      pickup ? fetchStops(pickup, pickupRadius, "pickup") : Promise.resolve([]),
      delivery ? fetchStops(delivery, deliveryRadius, "delivery") : Promise.resolve([]),
    ]);

    // Intersect order_ids
    let candidateOrderIds: Set<string>;
    if (pickup && delivery) {
      const pickSet = new Set(pickupStops.map(s => s.order_id));
      candidateOrderIds = new Set(deliveryStops.filter(s => pickSet.has(s.order_id)).map(s => s.order_id));
    } else if (pickup) {
      candidateOrderIds = new Set(pickupStops.map(s => s.order_id));
    } else {
      candidateOrderIds = new Set(deliveryStops.map(s => s.order_id));
    }

    if (candidateOrderIds.size === 0) {
      return new Response(JSON.stringify({
        overall: { count: 0, avgFreight: 0, avgMiles: 0, rpm: 0 },
        brokerStats: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Fetch matching orders (filter canceled, broker, date window) with broker info
    const ids = [...candidateOrderIds];
    const orders: { id: string; broker_id: string; freight_amount: number | null; loaded_miles: number | null; brokers: { name: string | null; mc_number: string | null } | null }[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      let q = db
        .from("orders")
        .select("id, broker_id, freight_amount, loaded_miles, brokers ( name, mc_number )")
        .in("id", chunk)
        .eq("canceled", false)
        .not("broker_id", "is", null);
      if (dateFrom) q = q.gte("pickup_datetime", dateFrom);
      if (dateToExclusive) q = q.lt("pickup_datetime", dateToExclusive);
      const { data, error } = await q;
      if (error) throw error;
      if (data) orders.push(...(data as any[]));
    }

    // Aggregate by broker
    const agg = new Map<string, { name: string; mc: string; freight: number; miles: number; count: number; orderIds: string[] }>();
    let totalFreight = 0, totalMiles = 0;
    for (const o of orders) {
      const f = Number(o.freight_amount) || 0;
      const m = Number(o.loaded_miles) || 0;
      totalFreight += f; totalMiles += m;
      const key = o.broker_id;
      let e = agg.get(key);
      if (!e) {
        e = {
          name: o.brokers?.name || "Unknown",
          mc: o.brokers?.mc_number || "",
          freight: 0, miles: 0, count: 0, orderIds: [],
        };
        agg.set(key, e);
      }
      e.freight += f; e.miles += m; e.count++;
      e.orderIds.push(o.id);
    }

    const brokerStats = [...agg.entries()].map(([broker_id, s]) => ({
      broker_id,
      broker_name: s.name,
      broker_mc: s.mc,
      total_freight: s.freight,
      avg_freight: s.count > 0 ? s.freight / s.count : 0,
      avg_miles: s.count > 0 ? s.miles / s.count : 0,
      rpm: s.miles > 0 ? s.freight / s.miles : 0,
      order_count: s.count,
      order_ids: s.orderIds,
    }));

    const count = orders.length;
    return new Response(JSON.stringify({
      overall: {
        count,
        avgFreight: count > 0 ? totalFreight / count : 0,
        avgMiles: count > 0 ? totalMiles / count : 0,
        rpm: totalMiles > 0 ? totalFreight / totalMiles : 0,
      },
      brokerStats,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("lane-search error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
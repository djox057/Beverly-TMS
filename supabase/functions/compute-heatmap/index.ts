import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Haversine distance in miles
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface Stop {
  truck_id: string;
  order_id: string;
  latitude: number;
  longitude: number;
}

interface City {
  city_name: string;
  state: string;
  latitude: number;
  longitude: number;
  population: number;
}

interface OrderFinancials {
  freight: number;
  miles: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("CRON_SECRET");

    // Dual auth: CRON_SECRET or authenticated admin/manager
    const authHeader = req.headers.get("Authorization") ?? "";
    let authorized = false;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      authorized = true;
    } else if (authHeader.startsWith("Bearer ")) {
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (!claimsError && claimsData?.claims?.sub) {
        const userId = claimsData.claims.sub;
        const adminClient = createClient(supabaseUrl, serviceRoleKey);
        const { data: roles } = await adminClient
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        if (roles?.some((r: any) => r.role === "admin" || r.role === "manager")) {
          authorized = true;
        }
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const db = createClient(supabaseUrl, serviceRoleKey);

    // Determine date range
    const url = new URL(req.url);
    let dateParam = url.searchParams.get("date");
    let fromParam = url.searchParams.get("from");
    let toParam = url.searchParams.get("to");

    if (!dateParam && !fromParam && !toParam) {
      try {
        const body = await req.json();
        dateParam = body.date || null;
        fromParam = body.from || null;
        toParam = body.to || null;
      } catch { /* no body */ }
    }

    const dates: string[] = [];
    if (dateParam) {
      dates.push(dateParam);
    } else if (fromParam && toParam) {
      const d = new Date(fromParam);
      const end = new Date(toParam);
      while (d <= end) {
        dates.push(d.toISOString().split("T")[0]);
        d.setDate(d.getDate() + 1);
      }
    } else {
      const now = new Date();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split("T")[0]);
      }
    }

    // Fetch reference cities once
    const { data: cities, error: citiesErr } = await db
      .from("heatmap_reference_cities")
      .select("city_name, state, latitude, longitude, population");
    if (citiesErr) throw citiesErr;
    const refCities: City[] = cities || [];

    const results: { date: string; clusters: number }[] = [];

    for (const targetDate of dates) {
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const nextDateStr = nextDate.toISOString().split("T")[0];

      // Fetch orders with financial data
      const { data: orders, error: ordersErr } = await db
        .from("orders")
        .select("id, truck_id, freight_amount, loaded_miles, dh_miles, mileage")
        .eq("canceled", false)
        .not("truck_id", "is", null)
        .gte("pickup_datetime", targetDate)
        .lt("pickup_datetime", nextDateStr);
      if (ordersErr) throw ordersErr;
      if (!orders || orders.length === 0) {
        results.push({ date: targetDate, clusters: 0 });
        continue;
      }

      const orderIds = orders.map((o: any) => o.id);
      const orderTruckMap = new Map<string, string>();
      const orderFinancials = new Map<string, OrderFinancials>();

      for (const o of orders) {
        orderTruckMap.set(o.id, o.truck_id);
        // Miles: mileage if not null, else (loaded_miles + dh_miles), else 0
        let miles = 0;
        if (o.mileage != null) {
          miles = Number(o.mileage);
        } else if (o.loaded_miles != null || o.dh_miles != null) {
          miles = (Number(o.loaded_miles) || 0) + (Number(o.dh_miles) || 0);
        }
        orderFinancials.set(o.id, {
          freight: Number(o.freight_amount) || 0,
          miles,
        });
      }

      // Fetch pickup_drops in chunks of 200
      const allStops: Stop[] = [];
      for (let i = 0; i < orderIds.length; i += 200) {
        const chunk = orderIds.slice(i, i + 200);
        const { data: pds, error: pdsErr } = await db
          .from("pickup_drops")
          .select("order_id, latitude, longitude")
          .in("order_id", chunk)
          .not("latitude", "is", null)
          .not("longitude", "is", null);
        if (pdsErr) throw pdsErr;
        if (pds) {
          for (const pd of pds) {
            const truckId = orderTruckMap.get(pd.order_id);
            if (truckId) {
              allStops.push({
                truck_id: truckId,
                order_id: pd.order_id,
                latitude: Number(pd.latitude),
                longitude: Number(pd.longitude),
              });
            }
          }
        }
      }

      if (allStops.length === 0) {
        results.push({ date: targetDate, clusters: 0 });
        continue;
      }

      // Grid-based density scan (0.5 degree cells)
      const CELL_SIZE = 0.5;
      const consumed = new Set<number>();
      const cityTrucks = new Map<string, Set<string>>();
      const cityOrders = new Map<string, Set<string>>();
      const cityInfo = new Map<string, { lat: number; lng: number }>();

      const getCellKey = (lat: number, lng: number) =>
        `${Math.floor(lat / CELL_SIZE)},${Math.floor(lng / CELL_SIZE)}`;

      const buildGrid = () => {
        const grid = new Map<string, number[]>();
        for (let i = 0; i < allStops.length; i++) {
          if (consumed.has(i)) continue;
          const key = getCellKey(allStops[i].latitude, allStops[i].longitude);
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key)!.push(i);
        }
        return grid;
      };

      const countDistinctTrucks = (indices: number[]) => {
        const trucks = new Set<string>();
        for (const i of indices) trucks.add(allStops[i].truck_id);
        return trucks.size;
      };

      // Greedy selection loop
      let iteration = 0;
      const MAX_ITERATIONS = 50;
      while (iteration++ < MAX_ITERATIONS) {
        const grid = buildGrid();
        let bestKey = "";
        let bestCount = 0;
        let bestIndices: number[] = [];
        for (const [key, indices] of grid) {
          const tc = countDistinctTrucks(indices);
          if (tc > bestCount) {
            bestCount = tc;
            bestKey = key;
            bestIndices = indices;
          }
        }
        if (bestCount < 3) break;

        // Weighted centroid
        let sumLat = 0, sumLng = 0;
        for (const i of bestIndices) {
          sumLat += allStops[i].latitude;
          sumLng += allStops[i].longitude;
        }
        const centLat = sumLat / bestIndices.length;
        const centLng = sumLng / bestIndices.length;

        // Collect stops within 60 miles
        const clusterTrucks = new Set<string>();
        const clusterOrders = new Set<string>();
        for (let i = 0; i < allStops.length; i++) {
          if (consumed.has(i)) continue;
          const s = allStops[i];
          if (Math.abs(s.latitude - centLat) > 1 || Math.abs(s.longitude - centLng) > 1) continue;
          if (haversine(centLat, centLng, s.latitude, s.longitude) <= 60) {
            clusterTrucks.add(s.truck_id);
            clusterOrders.add(s.order_id);
            consumed.add(i);
          }
        }

        if (clusterTrucks.size < 3) continue;

        // Snap to nearest major city
        let bestCity: City | null = null;
        for (const city of refCities) {
          if (Math.abs(city.latitude - centLat) > 1 || Math.abs(city.longitude - centLng) > 1) continue;
          if (haversine(centLat, centLng, city.latitude, city.longitude) <= 60) {
            if (!bestCity || city.population > bestCity.population) {
              bestCity = city;
            }
          }
        }

        if (!bestCity) continue;

        const cityKey = `${bestCity.city_name}|${bestCity.state}`;
        if (!cityTrucks.has(cityKey)) {
          cityTrucks.set(cityKey, new Set());
          cityOrders.set(cityKey, new Set());
          cityInfo.set(cityKey, { lat: bestCity.latitude, lng: bestCity.longitude });
        }
        for (const t of clusterTrucks) cityTrucks.get(cityKey)!.add(t);
        for (const oid of clusterOrders) {
          cityOrders.get(cityKey)!.add(oid);
        }
      }

      // Build upserts with financial totals
      const upserts = [];
      for (const [key, trucks] of cityTrucks) {
        const [name, state] = key.split("|");
        const info = cityInfo.get(key)!;
        const orders = cityOrders.get(key) || new Set<string>();
        let totalFreight = 0;
        let totalMiles = 0;
        for (const oid of orders) {
          const fin = orderFinancials.get(oid);
          if (fin) {
            totalFreight += fin.freight;
            totalMiles += fin.miles;
          }
        }
        upserts.push({
          city_name: name,
          city_state: state,
          city_lat: info.lat,
          city_lng: info.lng,
          count_date: targetDate,
          truck_count: trucks.size,
          total_freight: totalFreight,
          total_miles: totalMiles,
        });
      }

      if (upserts.length > 0) {
        const { error: upsertErr } = await db
          .from("heatmap_city_counts")
          .upsert(upserts, { onConflict: "city_name,city_state,count_date" });
        if (upsertErr) throw upsertErr;
      }

      results.push({ date: targetDate, clusters: upserts.length });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("compute-heatmap error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

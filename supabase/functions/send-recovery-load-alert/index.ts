import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.1";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { z } from "npm:zod@3.23.8";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BodySchema = z.object({ orderId: z.string().uuid() });

const RADIUS_MILES = 150;
const ROAD_FACTOR = 1.3;

const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const money = (v: number | null | undefined) =>
  v == null ? "—" : `$${Number(v).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const fmtDateTime = (v: string | null | undefined) => {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

const resolveSender = (companyName: string | null | undefined) => {
  const n = (companyName || "").toUpperCase();
  if (n.includes("BEVERLY FREIGHT")) return "Recovery Loads <dispatch@beverlyfreight.net>";
  if (n.includes("UNITED ENTERPRISE")) return "Recovery Loads <Dispatch@unitedenterprisesolutions.net>";
  if (n.includes("AP SILVER")) return "Recovery Loads <dispatch@apsilvertrans.net>";
  if (n.includes("BG PRIME") || n.includes("BEVERLY GROUP")) return "Recovery Loads <dispatch@bgprime.net>";
  return "Recovery Loads <dispatch@bfprime.net>";
};

const geocode = async (address: string) => {
  const token = Deno.env.get("MAPBOX_PUBLIC_TOKEN");
  if (!token || !address.trim()) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&country=US&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const j = await res.json();
  const c = j?.features?.[0]?.center;
  if (!Array.isArray(c)) return null;
  return { lat: c[1] as number, lon: c[0] as number };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { orderId } = parsed.data;

    const db = createClient(supabaseUrl, serviceKey);

    // ---- Load details ----
    const { data: order, error: orderErr } = await db
      .from("orders")
      .select(
        "id, internal_load_number, broker_load_number, freight_amount, driver_price, loaded_miles, dh_miles, weight, booked_by, broker_id, booked_by_company_id",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Order not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: stops }, { data: broker }, { data: company }] = await Promise.all([
      db
        .from("pickup_drops")
        .select("type, sequence_number, address, city, state, zip_code, datetime, latitude, longitude")
        .eq("order_id", orderId)
        .order("sequence_number", { ascending: true }),
      order.broker_id
        ? db.from("brokers").select("name").eq("id", order.broker_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      db.from("companies").select("name").eq("id", order.booked_by_company_id).maybeSingle(),
    ]);

    const pickups = (stops || []).filter((s: any) => s.type === "pickup");
    const deliveries = (stops || []).filter((s: any) => s.type === "delivery");
    const firstPickup: any = pickups[0];

    let pickupCoords: { lat: number; lon: number } | null =
      firstPickup?.latitude != null && firstPickup?.longitude != null
        ? { lat: Number(firstPickup.latitude), lon: Number(firstPickup.longitude) }
        : null;
    if (!pickupCoords && firstPickup) {
      pickupCoords = await geocode(
        [firstPickup.address, firstPickup.city, firstPickup.state, firstPickup.zip_code].filter(Boolean).join(", "),
      );
    }
    if (!pickupCoords) {
      return new Response(JSON.stringify({ error: "Could not resolve pickup coordinates" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Trucks nearby (based on each truck's last delivery) ----
    const since = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString();
    const { data: recent } = await db
      .from("orders")
      .select("id, truck_id, driver1_id, pickup_datetime")
      .eq("canceled", false)
      .not("truck_id", "is", null)
      .gte("pickup_datetime", since)
      .order("pickup_datetime", { ascending: true })
      .limit(5000);

    const lastByTruck = new Map<string, { orderId: string; driverId: string | null; date: string }>();
    for (const o of recent || []) {
      const t = (o as any).truck_id as string;
      const date = ((o as any).pickup_datetime as string) || "";
      const prev = lastByTruck.get(t);
      if (!prev || date >= prev.date) {
        lastByTruck.set(t, { orderId: (o as any).id, driverId: (o as any).driver1_id, date });
      }
    }

    const lastOrderIds = [...lastByTruck.values()].map((v) => v.orderId);
    const dropsByOrder = new Map<string, any[]>();
    for (let i = 0; i < lastOrderIds.length; i += 200) {
      const chunk = lastOrderIds.slice(i, i + 200);
      const { data: d } = await db
        .from("pickup_drops")
        .select("order_id, sequence_number, latitude, longitude, city, state")
        .in("order_id", chunk)
        .eq("type", "delivery")
        .order("sequence_number", { ascending: true });
      for (const row of d || []) {
        const list = dropsByOrder.get((row as any).order_id) || [];
        list.push(row);
        dropsByOrder.set((row as any).order_id, list);
      }
    }

    type Nearby = {
      truckId: string;
      driverId: string | null;
      miles: number;
      lastCity: string;
    };
    const nearby: Nearby[] = [];
    for (const [truckId, info] of lastByTruck.entries()) {
      const drops = dropsByOrder.get(info.orderId) || [];
      const lastDrop = drops[drops.length - 1];
      if (!lastDrop || lastDrop.latitude == null || lastDrop.longitude == null) continue;
      const miles = Math.round(
        haversine(pickupCoords.lat, pickupCoords.lon, Number(lastDrop.latitude), Number(lastDrop.longitude)) *
          ROAD_FACTOR,
      );
      if (miles > RADIUS_MILES) continue;
      nearby.push({
        truckId,
        driverId: info.driverId,
        miles,
        lastCity: [lastDrop.city, lastDrop.state].filter(Boolean).join(", "),
      });
    }

    if (nearby.length === 0) {
      return new Response(JSON.stringify({ sent: 0, trucksNearby: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const truckIds = nearby.map((n) => n.truckId);
    const driverIds = nearby.map((n) => n.driverId).filter(Boolean) as string[];

    const [{ data: trucks }, { data: drivers }] = await Promise.all([
      db.from("trucks").select("id, truck_number, dispatcher_id, is_active").in("id", truckIds),
      driverIds.length
        ? db.from("drivers").select("id, name, dispatcher_id, is_active").in("id", driverIds)
        : Promise.resolve({ data: [] } as any),
    ]);

    const truckMap = new Map((trucks || []).map((t: any) => [t.id, t]));
    const driverMap = new Map((drivers || []).map((d: any) => [d.id, d]));

    // Group by dispatcher user
    const groups = new Map<string, Nearby[]>();
    for (const n of nearby) {
      const driver: any = n.driverId ? driverMap.get(n.driverId) : null;
      const truck: any = truckMap.get(n.truckId);
      if (truck && truck.is_active === false) continue;
      if (driver && driver.is_active === false) continue;
      const dispatcherId: string | null = driver?.dispatcher_id || truck?.dispatcher_id || null;
      if (!dispatcherId) continue;
      const list = groups.get(dispatcherId) || [];
      list.push(n);
      groups.set(dispatcherId, list);
    }

    if (groups.size === 0) {
      return new Response(JSON.stringify({ sent: 0, trucksNearby: nearby.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, email, full_name")
      .in("user_id", [...groups.keys()]);
    const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

    const loadNumber = order.internal_load_number || "—";
    const brokerLoad = order.broker_load_number || "—";
    const companyName = (company as any)?.name || null;
    const brokerName = (broker as any)?.name || "—";
    const rpm = order.loaded_miles ? (Number(order.freight_amount || 0) / Number(order.loaded_miles)).toFixed(2) : null;
    const driverRpm = order.loaded_miles
      ? (Number(order.driver_price || 0) / Number(order.loaded_miles)).toFixed(2)
      : null;

    const stopBlock = (title: string, list: any[]) => `
      <div style="flex:1;min-width:260px">
        <div style="color:#94a3b8;font-size:12px;letter-spacing:.08em;font-weight:700;margin-bottom:8px">${title}</div>
        ${list
          .map(
            (s: any, i: number) => `
          <div style="border:1px solid #14532d;background:#0f2a22;border-radius:8px;padding:12px;margin-bottom:8px">
            <div style="color:#94a3b8;font-size:12px;margin-bottom:4px">Stop #${i + 1}</div>
            <div style="color:#e2e8f0;font-weight:700;font-size:14px">${esc(s.address)}</div>
            <div style="color:#cbd5e1;font-size:13px">${esc([s.city, s.state].filter(Boolean).join(", "))} ${esc(s.zip_code || "")}</div>
            <div style="color:#e2e8f0;font-size:13px;font-weight:600;margin-top:6px">${esc(fmtDateTime(s.datetime))}</div>
          </div>`,
          )
          .join("")}
      </div>`;

    const loadHeader = `
      <div style="background:#0f1e2e;padding:20px;border-radius:10px;font-family:Arial,Helvetica,sans-serif">
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-bottom:6px">
          Load #${esc(loadNumber)} &bull; Broker #${esc(brokerLoad)}
        </div>
        <div style="color:#cbd5e1;font-size:13px;margin-bottom:12px">
          ${money(order.freight_amount)} freight${rpm ? ` (${rpm}/mi RPM)` : ""} &nbsp;|&nbsp;
          ${money(order.driver_price)} driver pay${driverRpm ? ` (${driverRpm}/mi RPM)` : ""} &nbsp;|&nbsp;
          ${order.loaded_miles ?? "—"} mi &nbsp;|&nbsp; ${order.weight ? `${Number(order.weight).toLocaleString("en-US")} lbs` : "— lbs"}
        </div>
        <div style="color:#94a3b8;font-size:13px">Booked by: ${esc(companyName || order.booked_by || "—")}</div>
        <div style="color:#94a3b8;font-size:13px;margin-bottom:16px">Broker: ${esc(brokerName)}</div>
        <div style="display:flex;gap:16px;flex-wrap:wrap">
          ${stopBlock("PICKUP STOPS", pickups)}
          ${stopBlock("DELIVERY STOPS", deliveries)}
        </div>
      </div>`;

    const from = resolveSender(companyName);
    let sent = 0;
    const failures: string[] = [];

    for (const [dispatcherId, list] of groups.entries()) {
      const profile: any = profileMap.get(dispatcherId);
      if (!profile?.email) continue;

      const rows = list
        .sort((a, b) => a.miles - b.miles)
        .map((n) => {
          const truck: any = truckMap.get(n.truckId);
          const driver: any = n.driverId ? driverMap.get(n.driverId) : null;
          return `<tr>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(truck?.truck_number || "—")}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(driver?.name || "—")}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0">${esc(n.lastCity || "—")}</td>
            <td style="padding:8px;border-bottom:1px solid #e2e8f0;font-weight:700">~${n.miles} mi</td>
          </tr>`;
        })
        .join("");

      const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a">
          <p>Hi ${esc(profile.full_name || "")},</p>
          <p>A <strong>recovery load</strong> is available and you have ${list.length} truck${list.length > 1 ? "s" : ""} nearby.</p>
          ${loadHeader}
          <h3 style="margin:20px 0 8px">Your trucks near the pickup (approx. deadhead)</h3>
          <table style="border-collapse:collapse;width:100%;font-size:14px">
            <thead>
              <tr style="background:#f1f5f9;text-align:left">
                <th style="padding:8px">Truck #</th>
                <th style="padding:8px">Driver</th>
                <th style="padding:8px">Last delivery</th>
                <th style="padding:8px">Approx DH</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <p style="color:#64748b;font-size:12px;margin-top:16px">
            Deadhead is an estimate from each truck's last delivery to the load's first pickup.
            Open Recovery Loads in the app to assign one of your trucks.
          </p>
        </div>`;

      const { error } = await resend.emails.send({
        from,
        to: [profile.email],
        subject: `Recovery load #${loadNumber} - ${list.length} of your truck${list.length > 1 ? "s" : ""} nearby`,
        html,
      });
      if (error) failures.push(`${profile.email}: ${JSON.stringify(error)}`);
      else sent++;
    }

    return new Response(JSON.stringify({ sent, trucksNearby: nearby.length, failures }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("send-recovery-load-alert error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

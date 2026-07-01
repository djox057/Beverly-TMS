import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Truck as TruckIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSamsaraLocations } from "@/hooks/useSamsaraLocations";
import { DispatcherFleetMapView } from "@/components/DispatcherFleetMapDialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIndividualMode } from "@/contexts/IndividualModeContext";

interface TruckRow {
  id: string;
  truck_number: string | null;
  driver1_id: string | null;
  driver2_id: string | null;
  company_id: string | null;
}

interface DriverRow {
  id: string;
  name: string | null;
  company_id: string | null;
  dispatcher_id: string | null;
  hos_drive_minutes: number | null;
  hos_shift_minutes: number | null;
  hos_break_minutes: number | null;
  hos_cycle_minutes: number | null;
  home_latitude: number | null;
  home_longitude: number | null;
  home_city: string | null;
  home_state: string | null;
}

interface PickupDropRow {
  id: string;
  order_id: string;
  type: string;
  sequence_number: number | null;
  address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  datetime: string | null;
  arrived_at: string | null;
}

interface OrderFileRow {
  order_id: string;
  file_category: string | null;
}

interface OrderRow {
  id: string;
  truck_id: string | null;
  internal_load_number: number | string | null;
  broker_load_number: string | null;
  pickup_datetime: string | null;
  canceled: boolean | null;
  notes: string | null;
  pickup_drops?: PickupDropRow[];
  order_files?: OrderFileRow[];
}

const FLEET_QUERY_KEY = ["trucks-map-fleet"] as const;

function composeAddress(stop: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
} | null | undefined): string | undefined {
  if (!stop) return undefined;
  const stateZip = [stop.state, stop.zip_code].filter(Boolean).join(" ").trim();
  return [stop.address, stop.city, stateZip].filter(Boolean).join(", ") || undefined;
}

function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function fetchFleetMapData() {
  // 1) Active trucks (have a driver or location)
  const { data: trucks, error: trucksErr } = await supabase
    .from("trucks")
    .select("id, truck_number, driver1_id, driver2_id, company_id")
    .order("truck_number");
  if (trucksErr) throw trucksErr;
  const truckList = ((trucks as any[]) || []) as TruckRow[];

  const driverIds = Array.from(
    new Set(
      truckList
        .flatMap((t) => [t.driver1_id, t.driver2_id])
        .filter((v): v is string => !!v),
    ),
  );

  const [driversRes, companiesRes] = await Promise.all([
    driverIds.length
      ? supabase
          .from("drivers")
          .select(
            "id, name, company_id, dispatcher_id, hos_drive_minutes, hos_shift_minutes, hos_break_minutes, hos_cycle_minutes, home_latitude, home_longitude, home_city, home_state",
          )
          .in("id", driverIds)
      : Promise.resolve({ data: [] as DriverRow[], error: null as any }),
    supabase.from("companies").select("id, name"),
  ]);
  if (driversRes.error) throw driversRes.error;
  if (companiesRes.error) throw companiesRes.error;

  const driverMap = new Map<string, DriverRow>(
    ((driversRes.data || []) as DriverRow[]).map((d) => [d.id, d]),
  );
  const companyMap = new Map<string, string>(
    (companiesRes.data || []).map((c: any) => [c.id, c.name as string]),
  );

  // 2) Recent non-canceled orders for these trucks (last 60 days)
  const truckIds = truckList.map((t) => t.id);
  let orders: OrderRow[] = [];
  if (truckIds.length) {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    // chunk in 200s
    const chunks: string[][] = [];
    for (let i = 0; i < truckIds.length; i += 200) chunks.push(truckIds.slice(i, i + 200));
    const all = await Promise.all(
      chunks.map((ids) =>
        supabase
          .from("orders")
          .select(
            "id, truck_id, internal_load_number, broker_load_number, pickup_datetime, canceled, notes, pickup_drops(id, order_id, type, sequence_number, address, city, state, zip_code, latitude, longitude, datetime, arrived_at), order_files(order_id, file_category)",
          )
          .in("truck_id", ids)
          .eq("canceled", false)
          .gte("pickup_datetime", cutoff),
      ),
    );
    for (const res of all) {
      if (res.error) throw res.error;
      orders = orders.concat(((res.data as any[]) || []) as OrderRow[]);
    }
    orders = orders.filter((o) => o.notes !== "GAME|OVER");
  }

  // group orders by truck
  const ordersByTruck = new Map<string, OrderRow[]>();
  for (const o of orders) {
    if (!o.truck_id) continue;
    const arr = ordersByTruck.get(o.truck_id) || [];
    arr.push(o);
    ordersByTruck.set(o.truck_id, arr);
  }

  return { truckList, driverMap, companyMap, ordersByTruck };
}

function pickCurrentOrder(allOrders: OrderRow[]): OrderRow | null {
  if (!allOrders.length) return null;
  const sorted = [...allOrders].sort((a, b) => {
    const aT = new Date(a.pickup_datetime || "9999-12-31").getTime();
    const bT = new Date(b.pickup_datetime || "9999-12-31").getTime();
    return aT - bT;
  });

  const now = Date.now();
  const hasFile = (order: OrderRow, category: "BOL" | "POD") =>
    order.order_files?.some((f) => f.file_category === category) || false;
  const pickupTime = (order: OrderRow) =>
    order.pickup_datetime ? new Date(order.pickup_datetime).getTime() : Infinity;

  const openOrders = sorted.filter((order) => !hasFile(order, "POD"));
  const startedOpenOrders = openOrders.filter((order) => pickupTime(order) <= now);

  // Current load preference:
  // 1) Active/open load with BOL and no POD
  // 2) Active/open load with no POD whose pickup time has started
  // 3) Earliest upcoming open load
  // 4) Latest historical BOL load
  return (
    [...startedOpenOrders].reverse().find((order) => hasFile(order, "BOL")) ||
    startedOpenOrders[startedOpenOrders.length - 1] ||
    openOrders[0] ||
    [...sorted].reverse().find((order) => hasFile(order, "BOL")) ||
    sorted[sorted.length - 1]
  );
}

export default function TrucksMap() {
  const [search, setSearch] = useState("");
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string>("");
  const { profile, getPrimaryRole } = useAuthContext();
  const { individualOverrideDriverIds } = useIndividualMode();
  const primaryRole = getPrimaryRole();
  const isDispatch = primaryRole === "dispatch";
  const isAfterhours = primaryRole === "afterhours";
  const afterhoursDriverIds = individualOverrideDriverIds || [];
  const canUseIndividual =
    isDispatch || (isAfterhours && afterhoursDriverIds.length > 0);
  const [individualOnly, setIndividualOnly] = useState<boolean>(isDispatch);

  useEffect(() => {
    // Default ON for dispatchers; afterhours default OFF (user toggles in)
    if (isDispatch) setIndividualOnly(true);
  }, [isDispatch]);

  const { data: fleet, isLoading: fleetLoading } = useQuery({
    queryKey: FLEET_QUERY_KEY,
    queryFn: fetchFleetMapData,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: locations = [], isLoading: locsLoading } = useSamsaraLocations();

  // Build full TruckData[] for the fleet map (only trucks with a Samsara location)
  const trucksWithData = useMemo(() => {
    if (!fleet) return [];
    const locByTruckId = new Map<string, (typeof locations)[number]>();
    const locByNumber = new Map<string, (typeof locations)[number]>();
    for (const l of locations) {
      if (l.truck_id) locByTruckId.set(l.truck_id, l);
      if (l.truck_number)
        locByNumber.set((l.truck_number || "").trim(), l);
    }

    return fleet.truckList
      .map((t) => {
        const truckNumber = (t.truck_number || "").trim();
        const loc = locByTruckId.get(t.id) || locByNumber.get(truckNumber);
        if (!loc) return null;

        const driver1 = t.driver1_id ? fleet.driverMap.get(t.driver1_id) : null;
        const driver2 = t.driver2_id ? fleet.driverMap.get(t.driver2_id) : null;
        const companyId = driver1?.company_id || t.company_id || null;
        const companyName = companyId ? fleet.companyMap.get(companyId) : null;

        const orders = fleet.ordersByTruck.get(t.id) || [];
        const current = pickCurrentOrder(orders);

        let currentOrder: any = undefined;
        if (current) {
          const stops = current.pickup_drops || [];
          const pickups = stops
            .filter((s) => s.type === "pickup")
            .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
          const deliveries = stops
            .filter((s) => s.type === "delivery")
            .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
          const pickup = pickups[0] || null;
          const delivery = deliveries[deliveries.length - 1] || null;
          const hasBOL =
            current.order_files?.some((f) => f.file_category === "BOL") || false;
          const hasPOD =
            current.order_files?.some((f) => f.file_category === "POD") || false;
          currentOrder = {
            id: current.id,
            loadNumber: formatInternalLoadNumber(
              current.internal_load_number,
              companyName,
            ),
            brokerLoadNumber: current.broker_load_number || undefined,
            pickupAddress: composeAddress(pickup),
            deliveryAddress: composeAddress(delivery),
            pickupCity: pickup?.city || undefined,
            pickupState: pickup?.state || undefined,
            deliveryCity: delivery?.city || undefined,
            deliveryState: delivery?.state || undefined,
            pickupLatitude: pickup?.latitude ?? null,
            pickupLongitude: pickup?.longitude ?? null,
            deliveryLatitude: delivery?.latitude ?? null,
            deliveryLongitude: delivery?.longitude ?? null,
            pickupDatetime: pickup?.datetime || undefined,
            deliveryDatetime: delivery?.datetime || undefined,
            hasBOL,
            hasPOD,
            pickupArrived: !!pickup?.arrived_at,
          };
        }

        // Compute miles from truck GPS to next stop (haversine * 1.3 road factor)
        let milesAway: number | null = null;
        if (currentOrder && loc?.latitude != null && loc?.longitude != null) {
          const nextLat = currentOrder.hasBOL
            ? currentOrder.deliveryLatitude
            : currentOrder.pickupLatitude;
          const nextLng = currentOrder.hasBOL
            ? currentOrder.deliveryLongitude
            : currentOrder.pickupLongitude;
          if (nextLat != null && nextLng != null) {
            milesAway = Math.round(
              haversineMiles(
                { lat: loc.latitude, lng: loc.longitude },
                { lat: nextLat, lng: nextLng },
              ) * 1.3,
            );
          }
        }

        return {
          id: t.id,
          truckNumber,
          driver1Id: t.driver1_id || null,
          driver2Id: t.driver2_id || null,
          dispatcherId: driver1?.dispatcher_id || null,
          driverName: driver1?.name || "No driver",
          driver2Name: driver2?.name || undefined,
          companyId: companyId || null,
          companyName: companyName || null,
          milesAway,
          driveMinutes: driver1?.hos_drive_minutes ?? 0,
          shiftMinutes: driver1?.hos_shift_minutes ?? 0,
          breakMinutes: driver1?.hos_break_minutes ?? 0,
          cycleMinutes: driver1?.hos_cycle_minutes ?? 0,
          homeLatitude: driver1?.home_latitude ?? null,
          homeLongitude: driver1?.home_longitude ?? null,
          homeCity: driver1?.home_city ?? null,
          homeState: driver1?.home_state ?? null,
          currentOrder,
        };
      })
      .filter(Boolean) as Array<{
        id: string;
        truckNumber: string;
        driverName: string;
        driver2Name?: string;
      }> & any[];
  }, [fleet, locations]);

  // Company options sorted by name (only companies present in fleet)
  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of trucksWithData as any[]) {
      if (t.companyId && t.companyName) map.set(t.companyId, t.companyName);
    }
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [trucksWithData]);

  const filteredTrucks = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = trucksWithData as any[];
    if (individualOnly && canUseIndividual) {
      if (isDispatch && profile?.user_id) {
        list = list.filter((t) => t.dispatcherId === profile.user_id);
      } else if (isAfterhours) {
        const set = new Set(afterhoursDriverIds);
        list = list.filter(
          (t) =>
            (t.driver1Id && set.has(t.driver1Id)) ||
            (t.driver2Id && set.has(t.driver2Id)),
        );
      }
    }
    if (companyFilter) {
      list = list.filter((t) => t.companyId === companyFilter);
    }
    if (q) {
      list = list.filter(
        (t: any) =>
          t.truckNumber.toLowerCase().includes(q) ||
          (t.driverName || "").toLowerCase().includes(q) ||
          (t.driver2Name || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [
    trucksWithData,
    search,
    companyFilter,
    individualOnly,
    canUseIndividual,
    isDispatch,
    isAfterhours,
    profile?.user_id,
    afterhoursDriverIds,
  ]);

  // Auto-select when search narrows to exactly one truck
  useEffect(() => {
    if (search.trim() && filteredTrucks.length === 1) {
      const only = (filteredTrucks[0] as any).id as string;
      if (only !== selectedTruckId) setSelectedTruckId(only);
    }
  }, [search, filteredTrucks, selectedTruckId]);

  const loading = fleetLoading || locsLoading;

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Sidebar list */}
      <aside className="flex w-80 flex-col border-r bg-card">
        <div className="border-b p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <TruckIcon className="h-4 w-4" />
              Live Fleet Map
            </h2>
            {canUseIndividual && (
              <Button
                size="sm"
                variant={individualOnly ? "default" : "outline"}
                className="h-7 px-2 text-xs"
                onClick={() => setIndividualOnly((v) => !v)}
              >
                Individual
              </Button>
            )}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search truck # or driver"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="mt-2">
            <Combobox
              options={[{ value: "", label: "All companies" }, ...companyOptions]}
              value={companyFilter}
              onValueChange={(v) => setCompanyFilter(v)}
              placeholder="Filter by company"
              searchPlaceholder="Search company..."
              emptyText="No companies found."
              className="h-9 text-sm"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filteredTrucks.length} of {trucksWithData.length} truck
              {trucksWithData.length === 1 ? "" : "s"}
            </span>
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {filteredTrucks.length === 0 && !loading && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No trucks match this search.
              </div>
            )}
            {filteredTrucks.map((m: any) => (
              <div
                key={m.id}
                onClick={() => {
                  setSearch(m.truckNumber);
                  setSelectedTruckId(m.id);
                }}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 px-3 py-2 text-sm hover:bg-accent",
                  selectedTruckId === m.id && "bg-accent",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">#{m.truckNumber}</span>
                  {m.currentOrder?.loadNumber && (
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px] font-normal"
                    >
                      {m.currentOrder.loadNumber}
                    </Badge>
                  )}
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {m.driverName}
                  {m.driver2Name ? ` + ${m.driver2Name}` : ""}
                </span>
                {m.currentOrder?.brokerLoadNumber && (
                  <span className="truncate text-[10px] text-muted-foreground">
                    Broker #: {m.currentOrder.brokerLoadNumber}
                  </span>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Map */}
      <div className="relative flex-1">
        <DispatcherFleetMapView
          trucks={filteredTrucks as any}
          singleHomeOnly
          pinnedPopup
          fullAddress
          flyToOnSelect
          externalSelectedTruckId={selectedTruckId}
          onTruckSelect={(id) => {
            const t = (trucksWithData as any[]).find((x) => x.id === id);
            if (t) setSearch(t.truckNumber);
            setSelectedTruckId(id);
          }}
          onPopupClose={() => {
            setSearch("");
            setSelectedTruckId(null);
          }}
        />
      </div>
    </div>
  );
}
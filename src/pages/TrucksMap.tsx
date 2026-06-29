import { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Loader2, Search, MapPin, Truck as TruckIcon } from "lucide-react";
import { useTrucks } from "@/hooks/useTrucks";
import { useSamsaraLocations } from "@/hooks/useSamsaraLocations";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

let cachedMapboxToken: string | null = null;
async function getMapboxToken(): Promise<string> {
  if (cachedMapboxToken) return cachedMapboxToken;
  const { data, error } = await supabase.functions.invoke("get-mapbox-token");
  if (error || !data?.token) return "";
  cachedMapboxToken = data.token;
  return data.token;
}

interface MarkerInfo {
  truckId: string;
  truckNumber: string;
  driverName: string;
  driver2Name?: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

function formatRelative(iso: string): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diffMs)) return "—";
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function TrucksMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: trucks = [], isLoading: trucksLoading } = useTrucks();
  const { data: locations = [], isLoading: locsLoading } = useSamsaraLocations();

  const markers: MarkerInfo[] = useMemo(() => {
    if (!trucks.length || !locations.length) return [];
    return trucks
      .map((t: any) => {
        const tn = (t.truck_number || "").trim();
        const loc = locations.find(
          (l) => l.truck_id === t.id || (l.truck_number || "").trim() === tn,
        );
        if (!loc) return null;
        return {
          truckId: t.id,
          truckNumber: tn,
          driverName: t.driver1?.full_name || "Unassigned",
          driver2Name: t.driver2?.full_name,
          latitude: loc.latitude,
          longitude: loc.longitude,
          timestamp: loc.timestamp,
        } as MarkerInfo;
      })
      .filter(Boolean) as MarkerInfo[];
  }, [trucks, locations]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return markers;
    return markers.filter(
      (m) =>
        m.truckNumber.toLowerCase().includes(q) ||
        m.driverName.toLowerCase().includes(q) ||
        (m.driver2Name || "").toLowerCase().includes(q),
    );
  }, [markers, search]);

  // Init map once
  useEffect(() => {
    let cancelled = false;
    if (!mapContainer.current || mapRef.current) return;
    (async () => {
      const token = await getMapboxToken();
      if (cancelled || !token || !mapContainer.current) return;
      mapboxgl.accessToken = token;
      const m = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [-97, 39],
        zoom: 4,
      });
      m.addControl(new mapboxgl.NavigationControl({ visualizePitch: false }), "top-right");
      m.addControl(new mapboxgl.FullscreenControl(), "top-right");
      m.on("load", () => {
        if (cancelled) return;
        mapRef.current = m;
        setMapReady(true);
      });
    })();
    return () => {
      cancelled = true;
      markersRef.current.forEach((mk) => mk.remove());
      markersRef.current.clear();
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Render / update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visibleIds = new Set(filtered.map((m) => m.truckId));

    // Remove markers no longer visible
    markersRef.current.forEach((marker, id) => {
      if (!visibleIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    filtered.forEach((m) => {
      const existing = markersRef.current.get(m.truckId);
      const lngLat: [number, number] = [m.longitude, m.latitude];
      if (existing) {
        existing.setLngLat(lngLat);
        return;
      }
      const el = document.createElement("div");
      el.style.cursor = "pointer";
      el.innerHTML = `
        <div style="
          background: hsl(217 91% 60%);
          color: #fff;
          padding: 3px 7px;
          border-radius: 4px;
          font: 600 11px/1 system-ui, sans-serif;
          border: 2px solid #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,.35);
          white-space: nowrap;
        ">${m.truckNumber}</div>
      `;
      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat(lngLat)
        .addTo(map);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelectedId(m.truckId);
      });
      markersRef.current.set(m.truckId, marker);
    });
  }, [filtered, mapReady]);

  // Fly to / popup on selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selectedId) return;
    const m = markers.find((x) => x.truckId === selectedId);
    if (!m) return;
    map.flyTo({ center: [m.longitude, m.latitude], zoom: 10, speed: 1.4 });
    popupRef.current?.remove();
    popupRef.current = new mapboxgl.Popup({ offset: 18, closeButton: true })
      .setLngLat([m.longitude, m.latitude])
      .setHTML(
        `<div style="font: 12px/1.4 system-ui, sans-serif; min-width: 180px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px;">Truck ${m.truckNumber}</div>
          <div><strong>Driver:</strong> ${m.driverName}</div>
          ${m.driver2Name ? `<div><strong>Co-Driver:</strong> ${m.driver2Name}</div>` : ""}
          <div style="color:#666;margin-top:4px;">Updated ${formatRelative(m.timestamp)}</div>
        </div>`,
      )
      .addTo(map);
  }, [selectedId, markers, mapReady]);

  const loading = trucksLoading || locsLoading;

  return (
    <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
      {/* Sidebar list */}
      <aside className="flex w-80 flex-col border-r bg-card">
        <div className="border-b p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <TruckIcon className="h-4 w-4" />
            Live Fleet Map
          </h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search truck # or driver"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {filtered.length} of {markers.length} truck{markers.length === 1 ? "" : "s"}
            </span>
            {loading && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="divide-y">
            {filtered.length === 0 && !loading && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No trucks match this search.
              </div>
            )}
            {filtered.map((m) => (
              <button
                key={m.truckId}
                onClick={() => setSelectedId(m.truckId)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  selectedId === m.truckId && "bg-accent",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">#{m.truckNumber}</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-normal">
                    {formatRelative(m.timestamp)}
                  </Badge>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {m.driverName}
                  {m.driver2Name ? ` + ${m.driver2Name}` : ""}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </aside>

      {/* Map */}
      <div className="relative flex-1">
        <div ref={mapContainer} className="absolute inset-0" />
        {(!mapReady || loading) && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md bg-background/90 px-3 py-1.5 text-xs shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {loading ? "Loading truck locations…" : "Initializing map…"}
          </div>
        )}
        {mapReady && !loading && markers.length === 0 && (
          <div className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 rounded-md bg-background/95 px-4 py-3 text-center text-sm shadow">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <span>No truck locations available right now.</span>
          </div>
        )}
      </div>
    </div>
  );
}
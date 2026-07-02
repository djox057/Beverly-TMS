import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { Loader2, MapPin, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { HosCircularTimer } from '@/components/HosCircularTimer';

// Cache the token to avoid repeated API calls
let cachedMapboxToken: string | null = null;

const HOME_RADIUS_MILES = 300;
const EARTH_RADIUS_MILES = 3958.8;

const createRadiusCircle = (lng: number, lat: number, radiusMiles = HOME_RADIUS_MILES, points = 96) => {
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;
  const angularDistance = radiusMiles / EARTH_RADIUS_MILES;
  const coordinates: [number, number][] = [];

  for (let i = 0; i <= points; i += 1) {
    const bearing = (i / points) * 2 * Math.PI;
    const pointLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance) +
        Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const pointLngRad = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLatRad),
    );

    coordinates.push([(pointLngRad * 180) / Math.PI, (pointLatRad * 180) / Math.PI]);
  }

  return coordinates;
};

async function getMapboxToken(): Promise<string> {
  if (cachedMapboxToken) return cachedMapboxToken;
  
  try {
    const { data, error } = await supabase.functions.invoke('get-mapbox-token');
    if (error) throw error;
    cachedMapboxToken = data.token;
    return data.token;
  } catch (error) {
    console.error('Failed to get Mapbox token:', error);
    return '';
  }
}

interface TruckData {
  id: string;
  truckNumber: string;
  driverName: string;
  driver2Name?: string;
  milesAway?: number | null;
  driveMinutes?: number;
  shiftMinutes?: number;
  breakMinutes?: number;
  cycleMinutes?: number;
  homeLatitude?: number | null;
  homeLongitude?: number | null;
  homeCity?: string | null;
  homeState?: string | null;
  currentOrder?: {
    id: string;
    loadNumber: string;
    brokerLoadNumber?: string;
    pickupAddress?: string;
    deliveryAddress?: string;
    pickupCity?: string;
    pickupState?: string;
    deliveryCity?: string;
    deliveryState?: string;
    pickupLatitude?: number | null;
    pickupLongitude?: number | null;
    deliveryLatitude?: number | null;
    deliveryLongitude?: number | null;
    pickupDatetime?: string;
    deliveryDatetime?: string;
    hasBOL: boolean;
    hasPOD: boolean;
    pickupArrived: boolean;
    pickupStops?: Array<{
      address?: string;
      city?: string;
      state?: string;
      latitude?: number | null;
      longitude?: number | null;
      datetime?: string;
      arrived?: boolean;
      sequence?: number;
    }>;
    deliveryStops?: Array<{
      address?: string;
      city?: string;
      state?: string;
      latitude?: number | null;
      longitude?: number | null;
      datetime?: string;
      arrived?: boolean;
      sequence?: number;
    }>;
  };
}

interface DispatcherFleetMapViewProps {
  trucks: TruckData[];
  /** Only show home marker for the currently-selected truck. */
  singleHomeOnly?: boolean;
  /** Pin the popup to the bottom-right of the map container. */
  pinnedPopup?: boolean;
  /** Hide Miles Away and ETA rows in the popup. */
  hideMilesAndEta?: boolean;
  /** Show full pickup/delivery addresses (not just city/state). */
  fullAddress?: boolean;
  /** Externally controlled selected truck id (overrides internal selection). */
  externalSelectedTruckId?: string | null;
  /** Fly to truck on selection (marker click or external change). */
  flyToOnSelect?: boolean;
  /** Called when a truck marker is clicked. */
  onTruckSelect?: (truckId: string) => void;
  /** Called when the popup is closed. */
  onPopupClose?: () => void;
}

export function DispatcherFleetMapView({
  trucks,
  singleHomeOnly = false,
  pinnedPopup = false,
  hideMilesAndEta = false,
  fullAddress = false,
  externalSelectedTruckId,
  flyToOnSelect = false,
  onTruckSelect,
  onPopupClose,
}: DispatcherFleetMapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; lngLat: [number, number] }>>(new Map());
  const locationMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const homeMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const routeAddedRef = useRef(false);
  const tokenRef = useRef<string>('');
  const initStartedRef = useRef(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [noLocationsFound, setNoLocationsFound] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [popupTick, setPopupTick] = useState(0);
  const [minimized, setMinimized] = useState(false);

  const { data: locations } = useSamsaraLocations();

  // Create stable signature to detect real changes
  const trucksSignature = useMemo(() => {
    return trucks
      .map((t) => `${t.id}:${t.homeLatitude ?? ''}:${t.homeLongitude ?? ''}`)
      .sort()
      .join('|');
  }, [trucks]);

  // Signature that changes whenever a truck's next-stop coords change
  const nextStopSignature = useMemo(() => {
    return trucks
      .map((t) => {
        const o = t.currentOrder;
        const hasBOL = o?.hasBOL ? 1 : 0;
        return `${t.id}:${hasBOL}:${o?.pickupLatitude ?? ''},${o?.pickupLongitude ?? ''}:${o?.deliveryLatitude ?? ''},${o?.deliveryLongitude ?? ''}`;
      })
      .sort()
      .join('|');
  }, [trucks]);

  // Keep a stable ref of trucks for popup
  const trucksRef = useRef(trucks);
  trucksRef.current = trucks;

  // Find the selected truck from the current trucks array
  const selectedTruck = useMemo(() => {
    if (!selectedTruckId) return null;
    return trucks.find((t) => t.id === selectedTruckId) ?? null;
  }, [trucks, selectedTruckId]);

  // Get the marker position for the selected truck
  const selectedMarkerData = selectedTruckId ? markersRef.current.get(selectedTruckId) : null;

  // Handle truck marker click - just select, no zoom
  const handleTruckClick = useCallback((truckId: string) => {
    console.log('[FleetMap] Truck selected:', truckId);
    setSelectedTruckId(truckId);
    setMinimized(false);
    setPopupTick((n) => n + 1);
    onTruckSelect?.(truckId);
    if (flyToOnSelect) {
      const md = markersRef.current.get(truckId);
      if (md && map.current) {
        map.current.flyTo({ center: md.lngLat, zoom: Math.max(map.current.getZoom(), 8), duration: 800 });
      }
    }
  }, [flyToOnSelect, onTruckSelect]);

  // Sync external selection
  useEffect(() => {
    if (externalSelectedTruckId === undefined) return;
    setSelectedTruckId(externalSelectedTruckId);
    setMinimized(false);
    setPopupTick((n) => n + 1);
    if (externalSelectedTruckId && flyToOnSelect) {
      const md = markersRef.current.get(externalSelectedTruckId);
      if (md && map.current) {
        map.current.flyTo({ center: md.lngLat, zoom: Math.max(map.current.getZoom(), 8), duration: 800 });
      }
    }
  }, [externalSelectedTruckId, flyToOnSelect]);

  // Minimize popup into a small floating truck icon (does not deselect)
  const minimizePopup = useCallback(() => {
    setMinimized(true);
  }, []);

  const toFiniteCoordinate = (value?: number | string | null) => {
    const numericValue = typeof value === 'string' ? Number(value) : value;
    return typeof numericValue === 'number' && Number.isFinite(numericValue) ? numericValue : null;
  };

  const hasCoords = (lat?: number | string | null, lng?: number | string | null) =>
    toFiniteCoordinate(lat) !== null && toFiniteCoordinate(lng) !== null;

  // Determine next stop based on order status (hasBOL means heading to delivery)
  const getNextStop = (order: TruckData['currentOrder']) => {
    if (!order) return null;

    // If has BOL, driver is heading to delivery
    if (order.hasBOL) {
      if (hasCoords(order.deliveryLatitude, order.deliveryLongitude)) {
        return {
          type: 'delivery' as const,
          lat: order.deliveryLatitude,
          lng: order.deliveryLongitude,
          city: order.deliveryCity,
          state: order.deliveryState,
          address: order.deliveryAddress,
          datetime: order.deliveryDatetime,
        };
      }
    } else {
      // No BOL yet, driver is heading to pickup
      if (hasCoords(order.pickupLatitude, order.pickupLongitude)) {
        return {
          type: 'pickup' as const,
          lat: order.pickupLatitude,
          lng: order.pickupLongitude,
          city: order.pickupCity,
          state: order.pickupState,
          address: order.pickupAddress,
          datetime: order.pickupDatetime,
        };
      }
    }

    return null;
  };

  // Show pickup AND delivery markers + route line for selected truck
  useEffect(() => {
    // Clear previous location markers
    locationMarkersRef.current.forEach((m) => m.remove());
    locationMarkersRef.current = [];
    // Clear previous route
    if (map.current && routeAddedRef.current) {
      try {
        if (map.current.getLayer('fleet-route-line')) map.current.removeLayer('fleet-route-line');
        if (map.current.getSource('fleet-route')) map.current.removeSource('fleet-route');
      } catch { /* ignore */ }
      routeAddedRef.current = false;
    }

    if (!map.current || !selectedTruck?.currentOrder) {
      return;
    }

    const order = selectedTruck.currentOrder;

    const makeStopMarker = (
      lng: number,
      lat: number,
      kind: 'pickup' | 'delivery',
      indexLabel?: string,
    ) => {
      const el = document.createElement('div');
      const isPickup = kind === 'pickup';
      const emoji = isPickup ? '📍' : '🎯';
      const baseLabel = isPickup ? 'PICKUP' : 'DELIVERY';
      const label = indexLabel ? `${baseLabel} ${indexLabel}` : baseLabel;
      const bgColor = isPickup ? 'hsl(var(--warning))' : 'hsl(var(--destructive))';
      el.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.35));">
          <div style="font-size: 36px;">${emoji}</div>
          <div style="
            background: ${bgColor};
            color: hsl(var(--primary-foreground));
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            margin-top: -4px;
            white-space: nowrap;
          ">${label}</div>
        </div>
      `;
      const m = new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map.current!);
      locationMarkersRef.current.push(m);
    };

    // Prefer full arrays (multi-drop / multi-pickup); fall back to legacy single fields
    type StopCoord = { lat: number; lng: number; arrived: boolean };
    const pickupCoords: StopCoord[] = [];
    const deliveryCoords: StopCoord[] = [];

    if (order.pickupStops && order.pickupStops.length > 0) {
      order.pickupStops.forEach((s) => {
        const lat = toFiniteCoordinate(s.latitude);
        const lng = toFiniteCoordinate(s.longitude);
        if (lat !== null && lng !== null) pickupCoords.push({ lat, lng, arrived: !!s.arrived });
      });
    } else {
      const pLat = toFiniteCoordinate(order.pickupLatitude);
      const pLng = toFiniteCoordinate(order.pickupLongitude);
      if (pLat !== null && pLng !== null)
        pickupCoords.push({ lat: pLat, lng: pLng, arrived: !!order.pickupArrived });
    }

    if (order.deliveryStops && order.deliveryStops.length > 0) {
      order.deliveryStops.forEach((s) => {
        const lat = toFiniteCoordinate(s.latitude);
        const lng = toFiniteCoordinate(s.longitude);
        if (lat !== null && lng !== null) deliveryCoords.push({ lat, lng, arrived: !!s.arrived });
      });
    } else {
      const dLat = toFiniteCoordinate(order.deliveryLatitude);
      const dLng = toFiniteCoordinate(order.deliveryLongitude);
      if (dLat !== null && dLng !== null)
        deliveryCoords.push({ lat: dLat, lng: dLng, arrived: false });
    }

    pickupCoords.forEach((c, i) =>
      makeStopMarker(c.lng, c.lat, 'pickup', pickupCoords.length > 1 ? `${i + 1}` : undefined),
    );
    deliveryCoords.forEach((c, i) =>
      makeStopMarker(
        c.lng,
        c.lat,
        'delivery',
        deliveryCoords.length > 1 ? `${i + 1}` : undefined,
      ),
    );

    // Fit bounds to include truck + visible stops
    const bounds = new mapboxgl.LngLatBounds();
    if (selectedMarkerData?.lngLat) bounds.extend(selectedMarkerData.lngLat);
    pickupCoords.forEach((c) => bounds.extend([c.lng, c.lat]));
    deliveryCoords.forEach((c) => bounds.extend([c.lng, c.lat]));
    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { padding: 90, duration: 800, maxZoom: 9 });
    }

    // Build route: truck -> remaining pickups (any not yet arrived) -> all deliveries in order
    const routeCoords: Array<{ lat: number; lon: number }> = [];
    if (selectedMarkerData?.lngLat) {
      routeCoords.push({ lon: selectedMarkerData.lngLat[0], lat: selectedMarkerData.lngLat[1] });
    }
    const remainingPickups = order.hasBOL
      ? []
      : pickupCoords.filter((c) => !c.arrived);
    remainingPickups.forEach((c) => routeCoords.push({ lat: c.lat, lon: c.lng }));
    deliveryCoords.forEach((c) => routeCoords.push({ lat: c.lat, lon: c.lng }));

    if (routeCoords.length >= 2 && tokenRef.current) {
      const coordStr = routeCoords.map((c) => `${c.lon},${c.lat}`).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}?geometries=geojson&overview=full&access_token=${tokenRef.current}`;
      let cancelled = false;
      fetch(url)
        .then((r) => r.json())
        .then((data) => {
          if (cancelled || !map.current) return;
          const geom = data?.routes?.[0]?.geometry;
          if (!geom) return;
          try {
            if (map.current.getLayer('fleet-route-line')) map.current.removeLayer('fleet-route-line');
            if (map.current.getSource('fleet-route')) map.current.removeSource('fleet-route');
            map.current.addSource('fleet-route', {
              type: 'geojson',
              data: { type: 'Feature', properties: {}, geometry: geom },
            });
            map.current.addLayer({
              id: 'fleet-route-line',
              type: 'line',
              source: 'fleet-route',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: {
                'line-color': '#3b82f6',
                'line-width': 4,
                'line-opacity': 0.75,
              },
            });
            routeAddedRef.current = true;
          } catch (e) {
            console.warn('[FleetMap] route layer add failed', e);
          }
        })
        .catch((e) => console.warn('[FleetMap] route fetch failed', e));
      return () => {
        cancelled = true;
        locationMarkersRef.current.forEach((m) => m.remove());
        locationMarkersRef.current = [];
        if (map.current && routeAddedRef.current) {
          try {
            if (map.current.getLayer('fleet-route-line')) map.current.removeLayer('fleet-route-line');
            if (map.current.getSource('fleet-route')) map.current.removeSource('fleet-route');
          } catch { /* ignore */ }
          routeAddedRef.current = false;
        }
      };
    }

    return () => {
      locationMarkersRef.current.forEach((m) => m.remove());
      locationMarkersRef.current = [];
    };
  }, [selectedTruck?.id, selectedTruck?.currentOrder?.id, selectedTruck?.currentOrder?.hasBOL, isLoading]);

  // Initialize map ONCE
  useEffect(() => {
    if (!mapContainer.current) return;
    if (initStartedRef.current) return;
    if (!locations || locations.length === 0) {
      setIsLoading(false);
      setNoLocationsFound(true);
      return;
    }

    initStartedRef.current = true;
    let cancelled = false;

    const initializeMap = async () => {
      setIsLoading(true);
      setNoLocationsFound(false);
      
      try {
        const token = await getMapboxToken();
        if (cancelled) return;
        
        if (!token) {
          console.error('No Mapbox token available');
          setIsLoading(false);
          return;
        }
        
        tokenRef.current = token;

        // Find truck locations from Samsara
        const truckLocations = trucksRef.current
          .map(truck => {
            const loc = locations.find(l => 
              l.truck_id === truck.id || l.truck_number === truck.truckNumber
            );
            return loc ? { truck, location: loc } : null;
          })
          .filter(Boolean) as Array<{ truck: TruckData; location: (typeof locations)[0] }>;

        if (truckLocations.length === 0) {
          setNoLocationsFound(true);
          setIsLoading(false);
          return;
        }

        // Initialize map
        mapboxgl.accessToken = token;
        
        // Calculate center from all truck locations
        const avgLat = truckLocations.reduce((sum, t) => sum + t.location.latitude, 0) / truckLocations.length;
        const avgLon = truckLocations.reduce((sum, t) => sum + t.location.longitude, 0) / truckLocations.length;
        
        const newMap = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [avgLon, avgLat],
          zoom: 5,
        });

        newMap.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // ResizeObserver for container changes
        const resizeObserver = new ResizeObserver(() => {
          try {
            newMap.resize();
          } catch {
            // ignore
          }
        });
        resizeObserver.observe(mapContainer.current!);

        newMap.on('load', () => {
          if (cancelled) {
            resizeObserver.disconnect();
            newMap.remove();
            return;
          }

          newMap.resize();
          
          const bounds = new mapboxgl.LngLatBounds();

          // Add markers for each truck
          truckLocations.forEach(({ truck, location }) => {
            const el = document.createElement('div');
            el.className = 'truck-marker-fleet';
            el.style.cursor = 'pointer';
            el.style.pointerEvents = 'auto';
            el.style.touchAction = 'manipulation';

            el.innerHTML = `
              <div style="
                background: hsl(217 91% 60%);
                color: white;
                padding: 4px 8px;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 650;
                cursor: pointer;
                box-shadow: 0 2px 6px rgba(0,0,0,0.28);
                display: flex;
                align-items: center;
                gap: 6px;
                white-space: nowrap;
                border: 2px solid white;
              ">
                🚚 ${truck.truckNumber}
              </div>
            `;

            const lngLat: [number, number] = [location.longitude, location.latitude];
            const marker = new mapboxgl.Marker(el).setLngLat(lngLat).addTo(newMap);

            // Store marker reference with its position
            markersRef.current.set(truck.id, { marker, lngLat });

            const onSelect = (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
              handleTruckClick(truck.id);
            };

            // Make marker selection very reliable across browsers/devices
            el.addEventListener('click', onSelect);
            el.addEventListener('pointerup', onSelect);
            el.addEventListener('touchend', onSelect as unknown as EventListener, { passive: false });

            bounds.extend(lngLat);
          });

          const warningToken = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim();
          const warningColor = warningToken ? `hsl(${warningToken})` : 'hsl(38 92% 50%)';
          const homeLocations = singleHomeOnly ? [] : trucksRef.current
            .map((truck) => ({
              truck,
              lat: toFiniteCoordinate(truck.homeLatitude),
              lng: toFiniteCoordinate(truck.homeLongitude),
            }))
            .filter((home): home is { truck: TruckData; lat: number; lng: number } => home.lat !== null && home.lng !== null);

          console.info('[DispatcherFleetMapDialog] homeLocations', {
            count: homeLocations.length,
            coordinates: homeLocations.map(({ truck, lat, lng }) => ({
              truckId: truck.id,
              truckNumber: truck.truckNumber,
              driverName: truck.driverName,
              homeCity: truck.homeCity,
              homeState: truck.homeState,
              lat,
              lng,
            })),
          });

          if (homeLocations.length > 0) {
            const radiusFeatures: GeoJSON.Feature<GeoJSON.Polygon>[] = homeLocations.map(({ truck, lat, lng }) => {
              const circle = createRadiusCircle(lng, lat);
              circle.forEach((coordinate) => bounds.extend(coordinate));

              return {
                type: 'Feature',
                properties: { id: truck.id },
                geometry: {
                  type: 'Polygon',
                  coordinates: [circle],
                },
              };
            });

            newMap.addSource('driver-home-radius-zones', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: radiusFeatures,
              },
            });

            newMap.addLayer({
              id: 'driver-home-radius-zones-fill',
              type: 'fill',
              source: 'driver-home-radius-zones',
              paint: {
                'fill-color': warningColor,
                'fill-opacity': 0.18,
              },
            });

            newMap.addLayer({
              id: 'driver-home-radius-zones-outline',
              type: 'line',
              source: 'driver-home-radius-zones',
              paint: {
                'line-color': warningColor,
                'line-opacity': 0.8,
                'line-width': 2,
              },
            });

            console.info('[DispatcherFleetMapDialog] driver-home-radius-zones features', {
              featureCount: radiusFeatures.length,
              features: radiusFeatures.map((f) => ({
                id: (f.properties as { id?: string } | null)?.id,
                ringPoints: f.geometry.coordinates[0]?.length ?? 0,
                firstCoord: f.geometry.coordinates[0]?.[0],
              })),
            });
          } else {
            console.info('[DispatcherFleetMapDialog] driver-home-radius-zones features', {
              featureCount: 0,
              reason: 'homeLocations empty — radius source/layer not added',
            });
          }

          // Add home markers for ALL drivers with valid home coordinates
          // (not just those with current GPS location)
          homeLocations.forEach(({ truck, lat, lng }) => {
            const homeEl = document.createElement('div');
            homeEl.style.cursor = 'default';
            homeEl.style.pointerEvents = 'auto';
            homeEl.title = `${truck.driverName}${truck.homeCity || truck.homeState ? ` — ${[truck.homeCity, truck.homeState].filter(Boolean).join(', ')}` : ''}`;

            const badge = document.createElement('div');
            badge.style.width = '34px';
            badge.style.height = '34px';
            badge.style.borderRadius = '9999px';
            badge.style.background = warningColor;
            badge.style.color = 'hsl(var(--warning-foreground))';
            badge.style.border = '2px solid hsl(var(--background))';
            badge.style.boxShadow = '0 2px 8px hsl(var(--foreground) / 0.35)';
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.justifyContent = 'center';
            badge.style.fontSize = '20px';
            badge.style.lineHeight = '1';
            badge.textContent = '🏠';
            homeEl.appendChild(badge);

            const homeMarker = new mapboxgl.Marker({ element: homeEl, anchor: 'center' })
              .setLngLat([lng, lat])
              .addTo(newMap);
            homeMarkersRef.current.push(homeMarker);
            bounds.extend([lng, lat]);
          });

          // Fit map to show all trucks
          newMap.fitBounds(bounds, { padding: 60 });
          
          map.current = newMap;
          setIsLoading(false);
        });
        
        newMap.on('error', (e) => {
          console.error('Mapbox error:', e);
          setIsLoading(false);
        });

        // Update popup position when map moves
        newMap.on('move', () => {
          setPopupTick((n) => n + 1);
        });

        // Cleanup function override
        const originalRemove = newMap.remove.bind(newMap);
        newMap.remove = () => {
          try {
            resizeObserver.disconnect();
          } catch {
            // ignore
          }
          return originalRemove();
        };
        
      } catch (error) {
        console.error('Error initializing fleet map:', error);
        setIsLoading(false);
      }
    };

    // Delay to ensure container is rendered
    const timeout = window.setTimeout(() => {
      void initializeMap();
    }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      markersRef.current.forEach(({ marker }) => marker.remove());
      markersRef.current.clear();
      homeMarkersRef.current.forEach((m) => m.remove());
      homeMarkersRef.current = [];
      map.current?.remove();
      map.current = null;
      initStartedRef.current = false;
    };
  }, [locations?.length, trucksSignature, handleTruckClick, singleHomeOnly]);

  // Per-selection home marker (only when singleHomeOnly)
  useEffect(() => {
    if (!singleHomeOnly) return;
    // Clear previous home markers
    homeMarkersRef.current.forEach((m) => m.remove());
    homeMarkersRef.current = [];
    // Clear previous radius layers/source
    if (map.current) {
      try {
        if (map.current.getLayer('driver-home-radius-zones-outline')) map.current.removeLayer('driver-home-radius-zones-outline');
        if (map.current.getLayer('driver-home-radius-zones-fill')) map.current.removeLayer('driver-home-radius-zones-fill');
        if (map.current.getSource('driver-home-radius-zones')) map.current.removeSource('driver-home-radius-zones');
      } catch { /* ignore */ }
    }
    if (!map.current || !selectedTruck) return;
    const lat = toFiniteCoordinate(selectedTruck.homeLatitude);
    const lng = toFiniteCoordinate(selectedTruck.homeLongitude);
    if (lat === null || lng === null) return;
    const warningToken = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim();
    const warningColor = warningToken ? `hsl(${warningToken})` : 'hsl(38 92% 50%)';
    // Add radius around home
    try {
      const circle = createRadiusCircle(lng, lat);
      map.current.addSource('driver-home-radius-zones', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: { id: selectedTruck.id },
            geometry: { type: 'Polygon', coordinates: [circle] },
          }],
        },
      });
      map.current.addLayer({
        id: 'driver-home-radius-zones-fill',
        type: 'fill',
        source: 'driver-home-radius-zones',
        paint: { 'fill-color': warningColor, 'fill-opacity': 0.18 },
      });
      map.current.addLayer({
        id: 'driver-home-radius-zones-outline',
        type: 'line',
        source: 'driver-home-radius-zones',
        paint: { 'line-color': warningColor, 'line-opacity': 0.8, 'line-width': 2 },
      });
    } catch (e) {
      console.warn('[FleetMap] home radius add failed', e);
    }
    const homeEl = document.createElement('div');
    homeEl.style.cursor = 'default';
    homeEl.title = `${selectedTruck.driverName}${selectedTruck.homeCity || selectedTruck.homeState ? ` — ${[selectedTruck.homeCity, selectedTruck.homeState].filter(Boolean).join(', ')}` : ''}`;
    const badge = document.createElement('div');
    badge.style.width = '34px';
    badge.style.height = '34px';
    badge.style.borderRadius = '9999px';
    badge.style.background = warningColor;
    badge.style.color = 'hsl(var(--warning-foreground))';
    badge.style.border = '2px solid hsl(var(--background))';
    badge.style.boxShadow = '0 2px 8px hsl(var(--foreground) / 0.35)';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.fontSize = '20px';
    badge.style.lineHeight = '1';
    badge.textContent = '🏠';
    homeEl.appendChild(badge);
    const homeMarker = new mapboxgl.Marker({ element: homeEl, anchor: 'center' })
      .setLngLat([lng, lat])
      .addTo(map.current);
    homeMarkersRef.current.push(homeMarker);
    return () => {
      homeMarkersRef.current.forEach((m) => m.remove());
      homeMarkersRef.current = [];
      if (map.current) {
        try {
          if (map.current.getLayer('driver-home-radius-zones-outline')) map.current.removeLayer('driver-home-radius-zones-outline');
          if (map.current.getLayer('driver-home-radius-zones-fill')) map.current.removeLayer('driver-home-radius-zones-fill');
          if (map.current.getSource('driver-home-radius-zones')) map.current.removeSource('driver-home-radius-zones');
        } catch { /* ignore */ }
      }
    };
  }, [singleHomeOnly, selectedTruck]);

  // Click outside to close popup (but keep search value in parent)
  useEffect(() => {
    if (!selectedTruckId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.fleet-popup-panel')) return;
      if (target.closest('.truck-marker-fleet')) return;
      setSelectedTruckId(null);
    };

    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [selectedTruckId]);

  // Calculate popup position based on marker's screen position
  const popupStyle = useMemo(() => {
    // popupTick triggers recalculation on map move
    void popupTick;
    if (pinnedPopup) {
      return { right: '12px', bottom: '12px', left: 'auto', top: 'auto' } as React.CSSProperties;
    }
    if (!selectedMarkerData || !map.current || !mapContainer.current) return { display: 'none' };
    
    const point = map.current.project(selectedMarkerData.lngLat);
    const containerRect = mapContainer.current.getBoundingClientRect();
    const popupWidth = 340;
    const popupHeight = 380;
    
    let left = point.x - popupWidth / 2;
    let top = point.y - popupHeight - 30;
    
    // Clamp within container
    if (left < 8) left = 8;
    if (left + popupWidth > containerRect.width - 8) left = containerRect.width - popupWidth - 8;
    if (top < 8) top = point.y + 40; // Show below if not enough space above
    
    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [selectedMarkerData, selectedTruckId, popupTick, pinnedPopup]);

  // Calculate ETA based on miles away (rough estimate: 50 mph average)
  const calculateETA = (milesAway?: number | null) => {
    if (milesAway == null || milesAway <= 0) return null;
    const hoursAway = milesAway / 50; // Assume 50 mph average
    const etaDate = new Date(Date.now() + hoursAway * 60 * 60 * 1000);
    return etaDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Format location for display
  const formatLocation = (city?: string, state?: string, address?: string) => {
    if (city && state) return `${city}, ${state}`;
    if (address) {
      // Extract city, state from address if available
      const parts = address.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        return `${parts[parts.length - 3] || parts[0]}, ${parts[parts.length - 2] || parts[1]}`.replace(/\d{5}.*/, '').trim();
      }
      return address.length > 40 ? address.substring(0, 40) + '...' : address;
    }
    return null;
  };

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {noLocationsFound && !isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-10">
          <MapPin className="h-10 w-10 text-muted-foreground mb-2" />
          <p className="text-muted-foreground text-sm">No truck locations available</p>
        </div>
      )}

      {/* Minimized floating icon */}
      {selectedTruck && minimized && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMinimized(false);
          }}
          aria-label={`Restore vehicle ${selectedTruck.truckNumber}`}
          className="fleet-popup-panel absolute bottom-4 right-4 z-[10000] flex items-center gap-2 rounded-full bg-[hsl(199_89%_48%)] text-white shadow-xl border border-border pl-2 pr-3 py-2 hover:brightness-110"
        >
          <span className="text-lg leading-none">🚚</span>
          <span className="text-xs font-semibold">{selectedTruck.truckNumber}</span>
        </button>
      )}

      {/* Driver info popup - follows the truck marker */}
      {selectedTruck && !minimized && (pinnedPopup || selectedMarkerData) && (
        <div
          className={`fleet-popup-panel absolute ${pinnedPopup ? 'w-[280px]' : 'w-[340px]'} rounded-lg overflow-hidden shadow-xl border border-border`}
          style={{ ...popupStyle, zIndex: 9999 }}
        >
          {/* Header */}
          <div className="bg-[hsl(199_89%_48%)] text-white px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🚚</span>
              <span className="font-semibold">Vehicle: {selectedTruck.truckNumber}</span>
            </div>
            <button
              type="button"
              className="text-white/80 hover:text-white"
              onClick={minimizePopup}
              aria-label="Minimize"
              title="Minimize"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <div className="bg-card p-3 space-y-2">
            {/* Driver name */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[hsl(199_89%_48%)]">Driver:</span>
              <span className="font-medium text-foreground">
                {selectedTruck.driverName}
                {selectedTruck.driver2Name ? ` + ${selectedTruck.driver2Name}` : ''}
              </span>
            </div>

            {/* Load info - moved after Driver */}
            {selectedTruck.currentOrder && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(199_89%_48%)]">Load:</span>
                  <span className="font-medium text-foreground">{selectedTruck.currentOrder.loadNumber}</span>
                </div>
                {selectedTruck.currentOrder.brokerLoadNumber && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-[hsl(199_89%_48%)]">Broker #:</span>
                    <span className="font-medium text-foreground">{selectedTruck.currentOrder.brokerLoadNumber}</span>
                  </div>
                )}
              </>
            )}

            {/* Pickup Location */}
            {selectedTruck.currentOrder && (
              <div className="flex items-start justify-between text-sm">
                <span className="text-[hsl(199_89%_48%)]">Pickup:</span>
                <span className={`font-medium text-foreground text-right ${fullAddress ? 'max-w-[180px] break-words' : 'max-w-[200px] truncate'}`}>
                  {(fullAddress ? selectedTruck.currentOrder.pickupAddress : null) || formatLocation(
                    selectedTruck.currentOrder.pickupCity,
                    selectedTruck.currentOrder.pickupState,
                    selectedTruck.currentOrder.pickupAddress
                  ) || '—'}
                </span>
              </div>
            )}

            {/* Delivery Location */}
            {selectedTruck.currentOrder && (
              <div className="flex items-start justify-between text-sm">
                <span className="text-[hsl(199_89%_48%)]">Delivery:</span>
                <span className={`font-medium text-foreground text-right ${fullAddress ? 'max-w-[180px] break-words' : 'max-w-[200px] truncate'}`}>
                  {(fullAddress ? selectedTruck.currentOrder.deliveryAddress : null) || formatLocation(
                    selectedTruck.currentOrder.deliveryCity,
                    selectedTruck.currentOrder.deliveryState,
                    selectedTruck.currentOrder.deliveryAddress
                  ) || '—'}
                </span>
              </div>
            )}

            {!hideMilesAndEta && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(199_89%_48%)]">Miles Away:</span>
                  <span className="font-medium text-foreground">
                    {selectedTruck.milesAway != null ? `${selectedTruck.milesAway} mi` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(199_89%_48%)]">ETA:</span>
                  <span className="font-medium text-foreground">
                    {calculateETA(selectedTruck.milesAway) || '—'}
                  </span>
                </div>
              </>
            )}

            {/* HOS Circles */}
            <div className="pt-2 border-t border-border">
              <div className="text-xs text-muted-foreground mb-2">HOS Status</div>
              <div className="flex items-center justify-around">
                <div className="flex flex-col items-center">
                  <HosCircularTimer
                    minutes={selectedTruck.driveMinutes ?? 0}
                    maxMinutes={660}
                    label="Drive"
                    color="hsl(142 76% 36%)"
                    size={44}
                    strokeWidth={4}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">Drive</span>
                </div>
                <div className="flex flex-col items-center">
                  <HosCircularTimer
                    minutes={selectedTruck.shiftMinutes ?? 0}
                    maxMinutes={840}
                    label="Shift"
                    color="hsl(217 91% 60%)"
                    size={44}
                    strokeWidth={4}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">Shift</span>
                </div>
                <div className="flex flex-col items-center">
                  <HosCircularTimer
                    minutes={selectedTruck.breakMinutes ?? 0}
                    maxMinutes={480}
                    label="Break"
                    color="hsl(45 93% 47%)"
                    size={44}
                    strokeWidth={4}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">Break</span>
                </div>
                <div className="flex flex-col items-center">
                  <HosCircularTimer
                    minutes={selectedTruck.cycleMinutes ?? 0}
                    maxMinutes={4200}
                    label="Cycle"
                    color="hsl(280 67% 51%)"
                    size={44}
                    strokeWidth={4}
                  />
                  <span className="text-[10px] text-muted-foreground mt-1">Cycle</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={mapContainer} className="w-full h-full min-h-[600px]" />
    </div>
  );
}

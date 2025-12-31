import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { Loader2, MapPin, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { HosCircularTimer } from '@/components/HosCircularTimer';

// Cache the token to avoid repeated API calls
let cachedMapboxToken: string | null = null;

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
  };
}

interface DispatcherFleetMapViewProps {
  trucks: TruckData[];
}

export function DispatcherFleetMapView({ trucks }: DispatcherFleetMapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, { marker: mapboxgl.Marker; lngLat: [number, number] }>>(new Map());
  const locationMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const tokenRef = useRef<string>('');
  const initStartedRef = useRef(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [noLocationsFound, setNoLocationsFound] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [popupTick, setPopupTick] = useState(0);

  const { data: locations } = useSamsaraLocations();

  // Create stable signature to detect real changes
  const trucksSignature = useMemo(() => {
    return trucks
      .map((t) => t.id)
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
    setSelectedTruckId(truckId);
    setPopupTick((n) => n + 1);
  }, []);

  // Close popup
  const closePopup = useCallback(() => {
    setSelectedTruckId(null);
  }, []);

  // Show pickup/delivery markers for selected truck
  useEffect(() => {
    // Clear previous location markers
    locationMarkersRef.current.forEach((m) => m.remove());
    locationMarkersRef.current = [];

    if (!map.current || !selectedTruck?.currentOrder) {
      console.log('[FleetMap] No map or no currentOrder for selected truck', {
        hasMap: !!map.current,
        selectedTruckId: selectedTruck?.id,
        hasCurrentOrder: !!selectedTruck?.currentOrder,
      });
      return;
    }

    const order = selectedTruck.currentOrder;
    console.log('[FleetMap] Adding pickup/delivery markers for order', {
      loadNumber: order.loadNumber,
      pickupLat: order.pickupLatitude,
      pickupLng: order.pickupLongitude,
      deliveryLat: order.deliveryLatitude,
      deliveryLng: order.deliveryLongitude,
    });

    // Create pickup marker - orange package icon
    if (order.pickupLatitude && order.pickupLongitude) {
      const pickupEl = document.createElement('div');
      pickupEl.innerHTML = `
        <div style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          📦
        </div>
      `;
      const pickupMarker = new mapboxgl.Marker(pickupEl)
        .setLngLat([order.pickupLongitude, order.pickupLatitude])
        .addTo(map.current);
      locationMarkersRef.current.push(pickupMarker);
      console.log('[FleetMap] Added pickup marker at', order.pickupLatitude, order.pickupLongitude);
    }

    // Create delivery marker - red target/bullseye icon
    if (order.deliveryLatitude && order.deliveryLongitude) {
      const deliveryEl = document.createElement('div');
      deliveryEl.innerHTML = `
        <div style="font-size: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">
          🎯
        </div>
      `;
      const deliveryMarker = new mapboxgl.Marker(deliveryEl)
        .setLngLat([order.deliveryLongitude, order.deliveryLatitude])
        .addTo(map.current);
      locationMarkersRef.current.push(deliveryMarker);
      console.log('[FleetMap] Added delivery marker at', order.deliveryLatitude, order.deliveryLongitude);
    }

    return () => {
      locationMarkersRef.current.forEach((m) => m.remove());
      locationMarkersRef.current = [];
    };
  }, [selectedTruck]);

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
            const marker = new mapboxgl.Marker(el)
              .setLngLat(lngLat)
              .addTo(newMap);

            // Store marker reference with its position
            markersRef.current.set(truck.id, { marker, lngLat });

            el.addEventListener('click', (e) => {
              e.stopPropagation();
              handleTruckClick(truck.id);
            });
            
            bounds.extend(lngLat);
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
      map.current?.remove();
      map.current = null;
      initStartedRef.current = false;
    };
  }, [locations?.length, trucksSignature, handleTruckClick]);

  // Click outside to close popup
  useEffect(() => {
    if (!selectedTruckId) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.fleet-popup-panel')) return;
      if (target.closest('.truck-marker-fleet')) return;
      closePopup();
    };
    
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [selectedTruckId, closePopup]);

  // Calculate popup position based on marker's screen position
  const popupStyle = useMemo(() => {
    // popupTick triggers recalculation on map move
    void popupTick;
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
  }, [selectedMarkerData, selectedTruckId, popupTick]);

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

      {/* Driver info popup - follows the truck marker */}
      {selectedTruck && selectedMarkerData && (
        <div
          className="fleet-popup-panel absolute w-[340px] rounded-lg overflow-hidden shadow-xl border border-border"
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
              onClick={closePopup}
              aria-label="Close"
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
                <span className="font-medium text-foreground text-right max-w-[200px] truncate">
                  {formatLocation(
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
                <span className="font-medium text-foreground text-right max-w-[200px] truncate">
                  {formatLocation(
                    selectedTruck.currentOrder.deliveryCity,
                    selectedTruck.currentOrder.deliveryState,
                    selectedTruck.currentOrder.deliveryAddress
                  ) || '—'}
                </span>
              </div>
            )}

            {/* Miles Away */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[hsl(199_89%_48%)]">Miles Away:</span>
              <span className="font-medium text-foreground">
                {selectedTruck.milesAway != null ? `${selectedTruck.milesAway} mi` : '—'}
              </span>
            </div>

            {/* ETA (calculated from miles) */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[hsl(199_89%_48%)]">ETA:</span>
              <span className="font-medium text-foreground">
                {calculateETA(selectedTruck.milesAway) || '—'}
              </span>
            </div>

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

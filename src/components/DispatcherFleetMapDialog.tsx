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
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const tokenRef = useRef<string>('');
  const initStartedRef = useRef(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [noLocationsFound, setNoLocationsFound] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);

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

  // Handle truck marker click - just select, no zoom
  const handleTruckClick = useCallback((
    truckId: string,
    screenX: number,
    screenY: number
  ) => {
    setSelectedTruckId(truckId);
    setPopupPosition({ x: screenX, y: screenY });
  }, []);

  // Close popup
  const closePopup = useCallback(() => {
    setSelectedTruckId(null);
    setPopupPosition(null);
  }, []);

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
            
            const marker = new mapboxgl.Marker(el)
              .setLngLat([location.longitude, location.latitude])
              .addTo(newMap);

            el.addEventListener('click', (e) => {
              e.stopPropagation();
              const rect = mapContainer.current?.getBoundingClientRect();
              if (rect) {
                handleTruckClick(
                  truck.id,
                  e.clientX - rect.left,
                  e.clientY - rect.top
                );
              }
            });
            
            markersRef.current.push(marker);
            bounds.extend([location.longitude, location.latitude]);
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
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
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

  // Calculate popup position clamped within container
  const popupStyle = useMemo(() => {
    if (!popupPosition || !mapContainer.current) return {};
    const containerRect = mapContainer.current.getBoundingClientRect();
    const popupWidth = 320;
    const popupHeight = 280;
    
    let left = popupPosition.x - popupWidth / 2;
    let top = popupPosition.y - popupHeight - 20;
    
    // Clamp within container
    if (left < 8) left = 8;
    if (left + popupWidth > containerRect.width - 8) left = containerRect.width - popupWidth - 8;
    if (top < 8) top = popupPosition.y + 30; // Show below if not enough space above
    
    return {
      left: `${left}px`,
      top: `${top}px`,
    };
  }, [popupPosition]);

  // Format ETA from delivery datetime
  const formatETA = (deliveryDatetime?: string) => {
    if (!deliveryDatetime) return null;
    try {
      const date = new Date(deliveryDatetime);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return null;
    }
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

      {/* Driver info popup - positioned near the clicked marker */}
      {selectedTruck && popupPosition && (
        <div
          className="fleet-popup-panel absolute z-30 w-[320px] rounded-lg overflow-hidden shadow-lg border border-border"
          style={popupStyle}
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
          <div className="bg-card p-3 space-y-3">
            {/* Driver name */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[hsl(199_89%_48%)]">Driver:</span>
              <span className="font-medium text-foreground">
                {selectedTruck.driverName}
                {selectedTruck.driver2Name ? ` + ${selectedTruck.driver2Name}` : ''}
              </span>
            </div>

            {/* Miles Away */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[hsl(199_89%_48%)]">Miles Away:</span>
              <span className="font-medium text-foreground">
                {selectedTruck.milesAway != null ? `${selectedTruck.milesAway} mi` : '—'}
              </span>
            </div>

            {/* ETA */}
            {selectedTruck.currentOrder && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-[hsl(199_89%_48%)]">ETA:</span>
                <span className="font-medium text-foreground">
                  {formatETA(selectedTruck.currentOrder.deliveryDatetime) || '—'}
                </span>
              </div>
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

            {/* Load info */}
            {selectedTruck.currentOrder && (
              <div className="pt-2 border-t border-border text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Load:</span>
                  <span className="font-medium">{selectedTruck.currentOrder.loadNumber}</span>
                </div>
                {selectedTruck.currentOrder.brokerLoadNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Broker #:</span>
                    <span className="font-medium">{selectedTruck.currentOrder.brokerLoadNumber}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={mapContainer} className="w-full h-full min-h-[400px]" />
    </div>
  );
}

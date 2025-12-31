import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { Loader2, MapPin, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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

// Use Mapbox geocoding API
async function geocodeWithMapbox(address: string, token: string): Promise<{ lat: number; lon: number } | null> {
  if (!address || address.trim() === '' || !token) return null;
  
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${token}&limit=1`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const [lon, lat] = data.features[0].center;
      return { lat, lon };
    }
    
    return null;
  } catch (error) {
    console.error('Mapbox geocoding error:', error);
    return null;
  }
}

interface TruckData {
  id: string;
  truckNumber: string;
  driverName: string;
  driver2Name?: string;
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
  const routeLayerRef = useRef<boolean>(false);
  const tokenRef = useRef<string>('');
  
  const [isLoading, setIsLoading] = useState(true);
  const [noLocationsFound, setNoLocationsFound] = useState(false);
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null);

  const { data: locations } = useSamsaraLocations();

  const trucksSignature = useMemo(() => {
    return [...trucks]
      .sort((a, b) => a.truckNumber.localeCompare(b.truckNumber))
      .map((t) => `${t.id}:${t.truckNumber}:${t.currentOrder?.id ?? ''}`)
      .join('|');
  }, [trucks]);

  const locationsCount = locations?.length ?? 0;

  const selectedTruck = useMemo(() => {
    if (!selectedTruckId) return null;
    return trucks.find((t) => t.id === selectedTruckId) ?? null;
  }, [trucksSignature, selectedTruckId]);

  // Clear route from map
  const clearRoute = useCallback(() => {
    if (!map.current) return;
    
    if (routeLayerRef.current) {
      try {
        if (map.current.getLayer('route')) {
          map.current.removeLayer('route');
        }
        if (map.current.getSource('route')) {
          map.current.removeSource('route');
        }
      } catch (e) {
        // Ignore errors when removing layers
      }
      routeLayerRef.current = false;
    }
    
    // Remove destination markers (pickup/delivery)
    markersRef.current = markersRef.current.filter(marker => {
      const el = marker.getElement();
      if (el.innerHTML.includes('📍') || el.innerHTML.includes('🎯')) {
        marker.remove();
        return false;
      }
      return true;
    });
  }, []);

  // Draw route from truck to destination
  const drawRoute = useCallback(async (
    startCoords: [number, number],
    endCoords: [number, number],
    token: string,
    isPickup: boolean
  ) => {
    if (!map.current) return;
    
    try {
      const coordinates = `${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}`;
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${token}`
      );
      
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0].geometry;
        
        const addRoute = () => {
          if (!map.current) return;
          
          if (map.current.getSource('route')) {
            (map.current.getSource('route') as mapboxgl.GeoJSONSource).setData({
              type: 'Feature',
              properties: {},
              geometry: route
            });
          } else {
            map.current.addSource('route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                properties: {},
                geometry: route
              }
            });

            map.current.addLayer({
              id: 'route',
              type: 'line',
              source: 'route',
              layout: {
                'line-join': 'round',
                'line-cap': 'round'
              },
              paint: {
                'line-color': isPickup ? 'hsl(142 76% 36%)' : 'hsl(217 91% 60%)',
                'line-width': 4,
                'line-opacity': 0.75
              }
            });
          }
          
          routeLayerRef.current = true;
          
          // Fit map to show route
          const bounds = new mapboxgl.LngLatBounds();
          bounds.extend(startCoords);
          bounds.extend(endCoords);
          map.current?.fitBounds(bounds, { padding: 100 });
        };
        
        if (map.current.isStyleLoaded()) {
          addRoute();
        } else {
          map.current.once('load', addRoute);
        }
      }
    } catch (error) {
      console.error('Error drawing route:', error);
    }
  }, []);

  // Handle truck marker click
  const handleTruckClick = useCallback(async (
    truck: TruckData,
    location: { latitude: number; longitude: number },
    token: string
  ) => {
    clearRoute();
    setSelectedTruckId(truck.id);
    
    // Center map on selected truck
    map.current?.flyTo({
      center: [location.longitude, location.latitude],
      zoom: 8,
      duration: 1000,
    });
    
    // Draw route if there's a current order
    if (truck.currentOrder && map.current) {
      const { hasBOL, hasPOD, pickupArrived, pickupAddress, deliveryAddress } = truck.currentOrder;
      
      // Determine destination (same logic as single truck map)
      const shouldRouteToPickup = !hasBOL && !pickupArrived;
      const shouldRouteToDelivery = hasBOL && !hasPOD;
      
      if (shouldRouteToPickup && pickupAddress) {
        const pickupCoords = await geocodeWithMapbox(pickupAddress, token);
        if (pickupCoords && map.current) {
          const pickupEl = document.createElement('div');
          pickupEl.innerHTML = '📍';
          pickupEl.style.fontSize = '32px';
          
          const pickupMarker = new mapboxgl.Marker(pickupEl)
            .setLngLat([pickupCoords.lon, pickupCoords.lat])
            .addTo(map.current);
          markersRef.current.push(pickupMarker);
          
          await drawRoute(
            [location.longitude, location.latitude],
            [pickupCoords.lon, pickupCoords.lat],
            token,
            true
          );
        }
      } else if (shouldRouteToDelivery && deliveryAddress) {
        const deliveryCoords = await geocodeWithMapbox(deliveryAddress, token);
        if (deliveryCoords && map.current) {
          const deliveryEl = document.createElement('div');
          deliveryEl.innerHTML = '🎯';
          deliveryEl.style.fontSize = '32px';
          
          const deliveryMarker = new mapboxgl.Marker(deliveryEl)
            .setLngLat([deliveryCoords.lon, deliveryCoords.lat])
            .addTo(map.current);
          markersRef.current.push(deliveryMarker);
          
          await drawRoute(
            [location.longitude, location.latitude],
            [deliveryCoords.lon, deliveryCoords.lat],
            token,
            false
          );
        }
      }
    }
  }, [clearRoute, drawRoute]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current) return;
    
    if (!locations || locations.length === 0) {
      setIsLoading(false);
      setNoLocationsFound(true);
      return;
    }

    const initializeMap = async () => {
      setIsLoading(true);
      setNoLocationsFound(false);
      
      try {
        const token = await getMapboxToken();
        if (!token) {
          console.error('No Mapbox token available');
          setIsLoading(false);
          return;
        }
        
        tokenRef.current = token;

        // Find truck locations from Samsara
        const truckLocations = trucks
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

        newMap.on('load', () => {
          newMap.resize();
          
          const bounds = new mapboxgl.LngLatBounds();

          // Add markers for each truck
          truckLocations.forEach(({ truck, location }) => {
            const el = document.createElement('div');
            el.className = 'truck-marker-fleet';
            el.innerHTML = `
              <div style="
                background: ${truck.currentOrder ? 'hsl(var(--primary))' : 'hsl(var(--secondary))'};
                color: ${truck.currentOrder ? 'hsl(var(--primary-foreground))' : 'hsl(var(--secondary-foreground))'};
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
                border: 2px solid hsl(var(--background));
              ">
                🚚 ${truck.truckNumber}
              </div>
            `;
            el.style.cursor = 'pointer';
            
            const marker = new mapboxgl.Marker(el)
              .setLngLat([location.longitude, location.latitude])
              .addTo(newMap);
            
            el.addEventListener('click', () => {
              handleTruckClick(truck, {
                latitude: location.latitude,
                longitude: location.longitude,
              }, token);
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
        
      } catch (error) {
        console.error('Error initializing fleet map:', error);
        setIsLoading(false);
      }
    };

    // Small delay to ensure container is rendered
    const timeout = setTimeout(initializeMap, 50);

    return () => {
      clearTimeout(timeout);
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
      routeLayerRef.current = false;
    };
  }, [locations, trucks, handleTruckClick]);

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

      {/* Driver info popup (opens when a truck marker is clicked) */}
      {selectedTruck && (
        <div className="absolute left-3 bottom-3 z-20 w-[340px] max-w-[calc(100%-1.5rem)] rounded-lg border border-border bg-card/95 backdrop-blur p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-foreground truncate">
                Truck {selectedTruck.truckNumber}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {selectedTruck.driverName}{selectedTruck.driver2Name ? ` + ${selectedTruck.driver2Name}` : ""}
              </div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => {
                setSelectedTruckId(null);
                clearRoute();
              }}
              aria-label="Close driver info"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {selectedTruck.currentOrder ? (
            <div className="mt-2 space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Load</span>
                <span className="font-medium text-foreground truncate">
                  {selectedTruck.currentOrder.loadNumber}
                </span>
              </div>
              {selectedTruck.currentOrder.brokerLoadNumber && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Broker</span>
                  <span className="font-medium text-foreground truncate">
                    {selectedTruck.currentOrder.brokerLoadNumber}
                  </span>
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <span className="text-muted-foreground">Next</span>
                <span className="font-medium text-foreground text-right line-clamp-2">
                  {(!selectedTruck.currentOrder.hasBOL && !selectedTruck.currentOrder.pickupArrived
                    ? selectedTruck.currentOrder.pickupAddress
                    : selectedTruck.currentOrder.deliveryAddress) || "—"}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-xs text-muted-foreground">No current load</div>
          )}
        </div>
      )}

      <div ref={mapContainer} className="w-full h-full min-h-[400px]" />
    </div>
  );
}

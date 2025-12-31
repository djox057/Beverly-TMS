import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { Loader2, X, MapPin, Clock, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

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

// Reverse geocode coordinates to address
async function reverseGeocode(lat: number, lon: number, token: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&limit=1`
    );
    
    if (!response.ok) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      return data.features[0].place_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
    
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch (error) {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
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

interface DispatcherFleetMapDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  dispatcherId: string;
  dispatcherName: string;
  trucks: TruckData[];
}

interface SelectedTruckInfo {
  truck: TruckData;
  location: { latitude: number; longitude: number; timestamp: string };
  currentAddress: string;
}

export function DispatcherFleetMapDialog({
  isOpen,
  onOpenChange,
  dispatcherId,
  dispatcherName,
  trucks,
}: DispatcherFleetMapDialogProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const routeLayerRef = useRef<boolean>(false);
  
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTruck, setSelectedTruck] = useState<SelectedTruckInfo | null>(null);
  const [isLoadingRoute, setIsLoadingRoute] = useState(false);
  
  const { data: locations } = useSamsaraLocations();

  // Clear route from map
  const clearRoute = useCallback(() => {
    if (!map.current) return;
    
    if (routeLayerRef.current) {
      if (map.current.getLayer('route')) {
        map.current.removeLayer('route');
      }
      if (map.current.getSource('route')) {
        map.current.removeSource('route');
      }
      // Remove destination markers
      if (map.current.getLayer('pickup-marker')) {
        map.current.removeLayer('pickup-marker');
      }
      if (map.current.getSource('pickup-marker')) {
        map.current.removeSource('pickup-marker');
      }
      if (map.current.getLayer('delivery-marker')) {
        map.current.removeLayer('delivery-marker');
      }
      if (map.current.getSource('delivery-marker')) {
        map.current.removeSource('delivery-marker');
      }
      routeLayerRef.current = false;
    }
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
        
        // Add route layer
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
              'line-color': isPickup ? '#22c55e' : '#3b82f6',
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
        map.current.fitBounds(bounds, { padding: 100 });
      }
    } catch (error) {
      console.error('Error drawing route:', error);
    }
  }, []);

  // Handle truck marker click
  const handleTruckClick = useCallback(async (
    truck: TruckData,
    location: { latitude: number; longitude: number; timestamp: string },
    token: string
  ) => {
    setIsLoadingRoute(true);
    clearRoute();
    
    // Reverse geocode to get current address
    const currentAddress = await reverseGeocode(location.latitude, location.longitude, token);
    
    setSelectedTruck({
      truck,
      location,
      currentAddress,
    });
    
    // Draw route if there's a current order
    if (truck.currentOrder) {
      const { hasBOL, hasPOD, pickupArrived, pickupAddress, deliveryAddress } = truck.currentOrder;
      
      // Determine destination
      const shouldRouteToPickup = !hasBOL && !pickupArrived;
      const shouldRouteToDelivery = hasBOL && !hasPOD;
      
      if (shouldRouteToPickup && pickupAddress) {
        const pickupCoords = await geocodeWithMapbox(pickupAddress, token);
        if (pickupCoords) {
          // Add pickup marker
          const pickupEl = document.createElement('div');
          pickupEl.innerHTML = '📍';
          pickupEl.style.fontSize = '28px';
          
          const pickupMarker = new mapboxgl.Marker(pickupEl)
            .setLngLat([pickupCoords.lon, pickupCoords.lat])
            .addTo(map.current!);
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
        if (deliveryCoords) {
          // Add delivery marker
          const deliveryEl = document.createElement('div');
          deliveryEl.innerHTML = '🎯';
          deliveryEl.style.fontSize = '28px';
          
          const deliveryMarker = new mapboxgl.Marker(deliveryEl)
            .setLngLat([deliveryCoords.lon, deliveryCoords.lat])
            .addTo(map.current!);
          markersRef.current.push(deliveryMarker);
          
          await drawRoute(
            [location.longitude, location.latitude],
            [deliveryCoords.lon, deliveryCoords.lat],
            token,
            false
          );
        }
      }
      
      // If we have both addresses, show both markers
      if (pickupAddress && deliveryAddress) {
        const pickupCoords = await geocodeWithMapbox(pickupAddress, token);
        const deliveryCoords = await geocodeWithMapbox(deliveryAddress, token);
        
        if (pickupCoords && !shouldRouteToPickup) {
          const pickupEl = document.createElement('div');
          pickupEl.innerHTML = '📍';
          pickupEl.style.fontSize = '24px';
          pickupEl.style.opacity = '0.6';
          
          const marker = new mapboxgl.Marker(pickupEl)
            .setLngLat([pickupCoords.lon, pickupCoords.lat])
            .addTo(map.current!);
          markersRef.current.push(marker);
        }
        
        if (deliveryCoords && !shouldRouteToDelivery) {
          const deliveryEl = document.createElement('div');
          deliveryEl.innerHTML = '🎯';
          deliveryEl.style.fontSize = '24px';
          deliveryEl.style.opacity = '0.6';
          
          const marker = new mapboxgl.Marker(deliveryEl)
            .setLngLat([deliveryCoords.lon, deliveryCoords.lat])
            .addTo(map.current!);
          markersRef.current.push(marker);
        }
      }
    }
    
    setIsLoadingRoute(false);
  }, [clearRoute, drawRoute]);

  // Close popup
  const closePopup = useCallback(() => {
    setSelectedTruck(null);
    clearRoute();
    
    // Remove extra markers (pickup/delivery)
    markersRef.current.forEach(marker => {
      const el = marker.getElement();
      if (el.innerHTML === '📍' || el.innerHTML === '🎯') {
        marker.remove();
      }
    });
    
    // Refit to all trucks
    if (map.current && locations) {
      const bounds = new mapboxgl.LngLatBounds();
      let hasLocations = false;
      
      trucks.forEach(truck => {
        const loc = locations.find(l => 
          l.truck_id === truck.id || l.truck_number === truck.truckNumber
        );
        if (loc) {
          bounds.extend([loc.longitude, loc.latitude]);
          hasLocations = true;
        }
      });
      
      if (hasLocations) {
        map.current.fitBounds(bounds, { padding: 80 });
      }
    }
  }, [clearRoute, locations, trucks]);

  useEffect(() => {
    if (!isOpen || !mapContainer.current) return;

    const initializeMap = async () => {
      setIsLoading(true);
      setSelectedTruck(null);
      
      try {
        const token = await getMapboxToken();
        if (!token) {
          console.error('No Mapbox token available');
          setIsLoading(false);
          return;
        }

        // Find truck locations from Samsara
        const truckLocations = trucks
          .map(truck => {
            const loc = locations?.find(l => 
              l.truck_id === truck.id || l.truck_number === truck.truckNumber
            );
            return loc ? { truck, location: loc } : null;
          })
          .filter(Boolean) as Array<{ truck: TruckData; location: typeof locations[0] }>;

        if (truckLocations.length === 0) {
          console.warn('No truck locations found');
          setIsLoading(false);
          return;
        }

        // Initialize map
        mapboxgl.accessToken = token;
        
        // Calculate center from all truck locations
        const avgLat = truckLocations.reduce((sum, t) => sum + t.location.latitude, 0) / truckLocations.length;
        const avgLon = truckLocations.reduce((sum, t) => sum + t.location.longitude, 0) / truckLocations.length;
        
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [avgLon, avgLat],
          zoom: 5,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        const bounds = new mapboxgl.LngLatBounds();

        // Add markers for each truck
        truckLocations.forEach(({ truck, location }) => {
          const el = document.createElement('div');
          el.className = 'truck-marker-fleet';
          el.innerHTML = `
            <div style="
              background: ${truck.currentOrder ? '#3b82f6' : '#6b7280'};
              color: white;
              padding: 4px 8px;
              border-radius: 4px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
              box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              display: flex;
              align-items: center;
              gap: 4px;
              white-space: nowrap;
            ">
              🚚 ${truck.truckNumber}
            </div>
          `;
          el.style.cursor = 'pointer';
          
          const marker = new mapboxgl.Marker(el)
            .setLngLat([location.longitude, location.latitude])
            .addTo(map.current!);
          
          el.addEventListener('click', () => {
            handleTruckClick(truck, {
              latitude: location.latitude,
              longitude: location.longitude,
              timestamp: location.timestamp,
            }, token);
          });
          
          markersRef.current.push(marker);
          bounds.extend([location.longitude, location.latitude]);
        });

        // Fit map to show all trucks
        map.current.fitBounds(bounds, { padding: 80 });
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing fleet map:', error);
        setIsLoading(false);
      }
    };

    initializeMap();

    return () => {
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];
      map.current?.remove();
      map.current = null;
      routeLayerRef.current = false;
    };
  }, [isOpen, locations, trucks, handleTruckClick]);

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    try {
      return format(new Date(timestamp), 'MMM dd, h:mm a');
    } catch {
      return timestamp;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {dispatcherName}'s Fleet Map
            <span className="text-sm font-normal text-muted-foreground ml-2">
              ({trucks.length} truck{trucks.length !== 1 ? 's' : ''})
            </span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}
          
          <div ref={mapContainer} className="absolute inset-0" />
          
          {/* Truck Info Popup */}
          {selectedTruck && (
            <div className="absolute top-4 left-4 bg-card border border-border rounded-lg shadow-lg p-4 z-20 max-w-sm">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    🚚 Truck {selectedTruck.truck.truckNumber}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {selectedTruck.truck.driverName}
                    {selectedTruck.truck.driver2Name && ` & ${selectedTruck.truck.driver2Name}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={closePopup}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <span className="text-muted-foreground">Last update:</span>{' '}
                    {formatTimestamp(selectedTruck.location.timestamp)}
                  </div>
                </div>
                
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <span className="text-muted-foreground">Location:</span>{' '}
                    <span className="break-words">{selectedTruck.currentAddress}</span>
                  </div>
                </div>
                
                {selectedTruck.truck.currentOrder && (
                  <>
                    <div className="border-t pt-2 mt-2">
                      <div className="flex items-start gap-2">
                        <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div>
                          <span className="text-muted-foreground">Load:</span>{' '}
                          <span className="font-medium">{selectedTruck.truck.currentOrder.loadNumber}</span>
                          {selectedTruck.truck.currentOrder.brokerLoadNumber && (
                            <span className="text-muted-foreground ml-1">
                              ({selectedTruck.truck.currentOrder.brokerLoadNumber})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {selectedTruck.truck.currentOrder.pickupAddress && (
                      <div className="flex items-start gap-2 pl-6">
                        <span className="text-green-500">📍</span>
                        <div className="flex-1 break-words text-xs">
                          {selectedTruck.truck.currentOrder.pickupAddress}
                        </div>
                      </div>
                    )}
                    
                    {selectedTruck.truck.currentOrder.deliveryAddress && (
                      <div className="flex items-start gap-2 pl-6">
                        <span>🎯</span>
                        <div className="flex-1 break-words text-xs">
                          {selectedTruck.truck.currentOrder.deliveryAddress}
                        </div>
                      </div>
                    )}
                  </>
                )}
                
                {!selectedTruck.truck.currentOrder && (
                  <div className="text-muted-foreground italic pt-2 border-t mt-2">
                    No active load
                  </div>
                )}
              </div>
              
              {isLoadingRoute && (
                <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading route...
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

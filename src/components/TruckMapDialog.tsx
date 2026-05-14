import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

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

const toFiniteCoordinate = (value?: number | string | null) => {
  const numericValue = typeof value === 'string' ? Number(value) : value;
  return typeof numericValue === 'number' && Number.isFinite(numericValue) ? numericValue : null;
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

// Use Mapbox geocoding API directly instead of edge function
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

interface TruckMapDialogProps {
  truckNumber: string;
  truckId: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  pickupAddresses?: string[]; // All pickup addresses for multi-stop loads
  deliveryAddresses?: string[]; // All delivery addresses for multi-stop loads
  completedDeliveryCount?: number; // Number of PODs uploaded (completed deliveries)
  homeLatitude?: number | string | null;
  homeLongitude?: number | string | null;
  homeCity?: string | null;
  homeState?: string | null;
  pickupDate?: string;
  pickupTime?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  loadNumber?: string;
  brokerLoadNumber?: string;
  hasBOL: boolean;
  hasPOD: boolean;
  pickupArrived: boolean;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

export function TruckMapDialog({
  truckNumber,
  truckId,
  pickupAddress,
  deliveryAddress,
  pickupDate,
  pickupTime,
  deliveryDate,
  deliveryTime,
  loadNumber,
  brokerLoadNumber,
  hasBOL,
  hasPOD,
  pickupArrived,
  isOpen,
  onOpenChange,
  children,
}: TruckMapDialogProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { data: locations } = useSamsaraLocations();

  useEffect(() => {
    if (!isOpen || !mapContainer.current) return;

    const initializeMap = async () => {
      setIsLoading(true);
      
      try {
        // Get Mapbox token first
        const token = await getMapboxToken();
        if (!token) {
          console.error('No Mapbox token available');
          setIsLoading(false);
          return;
        }

        // Find truck location from Samsara
        const truckLocation = locations?.find(
          loc => loc.truck_id === truckId || loc.truck_number === truckNumber
        );

        if (!truckLocation) {
          console.warn('Truck location not found in Samsara data');
          setIsLoading(false);
          return;
        }

        // Initialize map
        mapboxgl.accessToken = token;
        
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [truckLocation.longitude, truckLocation.latitude],
          zoom: 6,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Add truck marker
        const truckEl = document.createElement('div');
        truckEl.className = 'truck-marker';
        truckEl.innerHTML = '🚚';
        truckEl.style.fontSize = '32px';
        
        new mapboxgl.Marker(truckEl)
          .setLngLat([truckLocation.longitude, truckLocation.latitude])
          .addTo(map.current);

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([truckLocation.longitude, truckLocation.latitude]);

        // Geocode and add pickup marker using Mapbox
        if (pickupAddress) {
          const pickupCoords = await geocodeWithMapbox(pickupAddress, token);
          if (pickupCoords) {
            const pickupEl = document.createElement('div');
            pickupEl.className = 'pickup-marker';
            pickupEl.innerHTML = '📍';
            pickupEl.style.fontSize = '32px';
            
            new mapboxgl.Marker(pickupEl)
              .setLngLat([pickupCoords.lon, pickupCoords.lat])
              .addTo(map.current);

            bounds.extend([pickupCoords.lon, pickupCoords.lat]);
          }
        }

        // Geocode and add delivery marker using Mapbox
        if (deliveryAddress) {
          const deliveryCoords = await geocodeWithMapbox(deliveryAddress, token);
          if (deliveryCoords) {
            const deliveryEl = document.createElement('div');
            deliveryEl.className = 'delivery-marker';
            deliveryEl.innerHTML = '🎯';
            deliveryEl.style.fontSize = '32px';
            
            new mapboxgl.Marker(deliveryEl)
              .setLngLat([deliveryCoords.lon, deliveryCoords.lat])
              .addTo(map.current);

            bounds.extend([deliveryCoords.lon, deliveryCoords.lat]);

            // If we have both pickup and delivery, draw a route
            if (pickupAddress) {
              const pickupCoords = await geocodeWithMapbox(pickupAddress, token);
              if (pickupCoords) {
                await drawRoute(
                  map.current,
                  [truckLocation.longitude, truckLocation.latitude],
                  [pickupCoords.lon, pickupCoords.lat],
                  [deliveryCoords.lon, deliveryCoords.lat],
                  token
                );
              }
            }
          }
        }

        // Fit map to bounds
        map.current.fitBounds(bounds, { padding: 100 });
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing map:', error);
        setIsLoading(false);
      }
    };

    initializeMap();

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [isOpen, locations, truckId, truckNumber, pickupAddress, deliveryAddress]);

  const drawRoute = async (
    mapInstance: mapboxgl.Map,
    truckCoords: [number, number],
    pickupCoords: [number, number],
    deliveryCoords: [number, number],
    token: string
  ) => {
    try {
      // Get route from Mapbox Directions API
      const coordinates = `${truckCoords[0]},${truckCoords[1]};${pickupCoords[0]},${pickupCoords[1]};${deliveryCoords[0]},${deliveryCoords[1]}`;
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${token}`
      );
      
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0].geometry;
        
        // Check if map is already loaded
        if (mapInstance.isStyleLoaded()) {
          addRouteToMap(mapInstance, route);
        } else {
          mapInstance.once('load', () => {
            addRouteToMap(mapInstance, route);
          });
        }
      }
    } catch (error) {
      console.error('Error drawing route:', error);
    }
  };

  const addRouteToMap = (mapInstance: mapboxgl.Map, route: any) => {
    if (mapInstance.getSource('route')) {
      (mapInstance.getSource('route') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: route
      });
    } else {
      mapInstance.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: route
        }
      });

      mapInstance.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 4,
          'line-opacity': 0.75
        }
      });
    }
  };

  return (
    <div onClick={() => onOpenChange(!isOpen)}>
      {children}
    </div>
  );
}

export function TruckMapView({
  truckNumber,
  truckId,
  pickupAddress,
  deliveryAddress,
  pickupAddresses,
  deliveryAddresses,
  completedDeliveryCount = 0,
  homeLatitude,
  homeLongitude,
  homeCity,
  homeState,
  pickupDate,
  pickupTime,
  deliveryDate,
  deliveryTime,
  loadNumber,
  brokerLoadNumber,
  hasBOL,
  hasPOD,
  pickupArrived,
}: Omit<TruckMapDialogProps, 'children' | 'isOpen' | 'onOpenChange'>) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { data: locations } = useSamsaraLocations();

  // Use array of addresses if provided, otherwise fallback to single address
  const allPickupAddresses = pickupAddresses?.length ? pickupAddresses : (pickupAddress ? [pickupAddress] : []);
  const allDeliveryAddresses = deliveryAddresses?.length ? deliveryAddresses : (deliveryAddress ? [deliveryAddress] : []);

  useEffect(() => {
    if (!mapContainer.current) return;

    const initializeMap = async () => {
      setIsLoading(true);
      
      try {
        // Get Mapbox token first
        const token = await getMapboxToken();
        if (!token) {
          console.error('No Mapbox token available');
          setIsLoading(false);
          return;
        }

        // Find truck location from Samsara
        const truckLocation = locations?.find(
          loc => loc.truck_id === truckId || loc.truck_number === truckNumber
        );

        if (!truckLocation) {
          console.warn('Truck location not found in Samsara data');
          setIsLoading(false);
          return;
        }

        // Initialize map
        mapboxgl.accessToken = token;
        
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [truckLocation.longitude, truckLocation.latitude],
          zoom: 6,
        });

        map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        // Add truck marker
        const truckEl = document.createElement('div');
        truckEl.className = 'truck-marker';
        truckEl.innerHTML = '🚚';
        truckEl.style.fontSize = '32px';
        
        new mapboxgl.Marker(truckEl)
          .setLngLat([truckLocation.longitude, truckLocation.latitude])
          .addTo(map.current);

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([truckLocation.longitude, truckLocation.latitude]);

        const homeLat = toFiniteCoordinate(homeLatitude);
        const homeLng = toFiniteCoordinate(homeLongitude);
        const hasHomeLocation = homeLat !== null && homeLng !== null;
        const warningToken = getComputedStyle(document.documentElement).getPropertyValue('--warning').trim();
        const warningColor = warningToken ? `hsl(${warningToken})` : 'hsl(38 92% 50%)';

        console.debug('[TruckMapView] homeLocations', {
          count: hasHomeLocation ? 1 : 0,
          coordinates: hasHomeLocation
            ? [{ truckId, truckNumber, homeCity, homeState, lat: homeLat, lng: homeLng }]
            : [],
        });

        if (hasHomeLocation) {
          const circle = createRadiusCircle(homeLng, homeLat);
          circle.forEach((coordinate) => bounds.extend(coordinate));
          bounds.extend([homeLng, homeLat]);

          const addHomeRadiusLayer = () => {
            if (!map.current || map.current.getSource('driver-home-radius-zone')) return;

            map.current.addSource('driver-home-radius-zone', {
              type: 'geojson',
              data: {
                type: 'FeatureCollection',
                features: [{
                  type: 'Feature',
                  properties: { id: truckId },
                  geometry: {
                    type: 'Polygon',
                    coordinates: [circle],
                  },
                }],
              },
            });

            map.current.addLayer({
              id: 'driver-home-radius-zone-fill',
              type: 'fill',
              source: 'driver-home-radius-zone',
              paint: {
                'fill-color': warningColor,
                'fill-opacity': 0.18,
              },
            });

            map.current.addLayer({
              id: 'driver-home-radius-zone-outline',
              type: 'line',
              source: 'driver-home-radius-zone',
              paint: {
                'line-color': warningColor,
                'line-opacity': 0.8,
                'line-width': 2,
              },
            });
          };

          if (map.current.isStyleLoaded()) {
            addHomeRadiusLayer();
          } else {
            map.current.once('load', addHomeRadiusLayer);
          }

          const homeEl = document.createElement('div');
          homeEl.title = `${truckNumber} home${homeCity || homeState ? ` — ${[homeCity, homeState].filter(Boolean).join(', ')}` : ''}`;
          homeEl.innerHTML = `
            <div style="width:34px;height:34px;border-radius:9999px;background:${warningColor};color:hsl(var(--warning-foreground));border:2px solid hsl(var(--background));box-shadow:0 2px 8px hsl(var(--foreground) / 0.35);display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;">🏠</div>
          `;

          new mapboxgl.Marker({ element: homeEl, anchor: 'center' })
            .setLngLat([homeLng, homeLat])
            .addTo(map.current);

          console.debug('[TruckMapView] driver-home-radius-zone features', {
            featureCount: 1,
            features: [{ id: truckId, ringPoints: circle.length, firstCoord: circle[0] }],
          });
        } else {
          console.debug('[TruckMapView] driver-home-radius-zone features', {
            featureCount: 0,
            reason: 'home location missing — radius source/layer not added',
          });
        }

        // Determine routing logic based on order status
        const shouldRouteToPickup = !hasBOL && !pickupArrived;
        // Route to delivery if BOL exists and there are still incomplete deliveries
        const hasIncompleteDeliveries = completedDeliveryCount < allDeliveryAddresses.length;
        const shouldRouteToDelivery = hasBOL && hasIncompleteDeliveries;

        // Add ALL pickup markers with numbered labels
        const pickupCoordsList: { lon: number; lat: number }[] = [];
        for (let i = 0; i < allPickupAddresses.length; i++) {
          const address = allPickupAddresses[i];
          if (!address) continue;
          
          const coords = await geocodeWithMapbox(address, token);
          if (coords) {
            pickupCoordsList.push(coords);
            const pickupEl = document.createElement('div');
            pickupEl.className = 'pickup-marker';
            pickupEl.style.display = 'flex';
            pickupEl.style.alignItems = 'center';
            pickupEl.style.gap = '4px';
            // Show number only if multiple pickups
            if (allPickupAddresses.length > 1) {
              pickupEl.innerHTML = `<span style="background:#22c55e;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;">P${i + 1}</span>`;
            } else {
              pickupEl.innerHTML = '📍';
              pickupEl.style.fontSize = '32px';
            }
            
            new mapboxgl.Marker(pickupEl)
              .setLngLat([coords.lon, coords.lat])
              .addTo(map.current!);

            bounds.extend([coords.lon, coords.lat]);
          }
        }

        // Add ALL delivery markers with numbered labels (show completed ones differently)
        const deliveryCoordsList: { lon: number; lat: number }[] = [];
        for (let i = 0; i < allDeliveryAddresses.length; i++) {
          const address = allDeliveryAddresses[i];
          if (!address) continue;
          
          const coords = await geocodeWithMapbox(address, token);
          if (coords) {
            deliveryCoordsList.push(coords);
            const deliveryEl = document.createElement('div');
            deliveryEl.className = 'delivery-marker';
            deliveryEl.style.display = 'flex';
            deliveryEl.style.alignItems = 'center';
            deliveryEl.style.gap = '4px';
            
            const isCompleted = i < completedDeliveryCount;
            // Show number only if multiple deliveries, with different color for completed
            if (allDeliveryAddresses.length > 1) {
              deliveryEl.innerHTML = isCompleted
                ? `<span style="background:#22c55e;color:white;border-radius:12px;padding:4px 8px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;white-space:nowrap;">D${i + 1} ✓</span>`
                : `<span style="background:#ef4444;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;">D${i + 1}</span>`;
            } else {
              deliveryEl.innerHTML = '🎯';
              deliveryEl.style.fontSize = '32px';
            }
            
            new mapboxgl.Marker(deliveryEl)
              .setLngLat([coords.lon, coords.lat])
              .addTo(map.current!);

            bounds.extend([coords.lon, coords.lat]);
          }
        }

        // Draw route to first pickup if going to pickup
        if (shouldRouteToPickup && pickupCoordsList.length > 0) {
          await drawRouteToDestination(
            map.current,
            [truckLocation.longitude, truckLocation.latitude],
            [pickupCoordsList[0].lon, pickupCoordsList[0].lat],
            token
          );
        } else if (shouldRouteToDelivery && deliveryCoordsList.length > 0) {
          // Route to first INCOMPLETE delivery (skip completed ones)
          const nextDeliveryIndex = Math.min(completedDeliveryCount, deliveryCoordsList.length - 1);
          await drawRouteToDestination(
            map.current,
            [truckLocation.longitude, truckLocation.latitude],
            [deliveryCoordsList[nextDeliveryIndex].lon, deliveryCoordsList[nextDeliveryIndex].lat],
            token
          );
        }

        // Fit map to bounds
        map.current.fitBounds(bounds, { padding: 100 });
        
        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing map:', error);
        setIsLoading(false);
      }
    };

    initializeMap();

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [locations, truckId, truckNumber, allPickupAddresses.join(','), allDeliveryAddresses.join(','), completedDeliveryCount, hasBOL, hasPOD, pickupArrived]);

  const drawRouteToDestination = async (
    mapInstance: mapboxgl.Map,
    startCoords: [number, number],
    endCoords: [number, number],
    token: string
  ) => {
    try {
      const coordinates = `${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}`;
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${token}`
      );
      
      const data = await response.json();
      
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0].geometry;
        
        if (mapInstance.isStyleLoaded()) {
          addRouteToMap(mapInstance, route);
        } else {
          mapInstance.once('load', () => {
            addRouteToMap(mapInstance, route);
          });
        }
      }
    } catch (error) {
      console.error('Error drawing route:', error);
    }
  };

  const addRouteToMap = (mapInstance: mapboxgl.Map, route: any) => {
    if (mapInstance.getSource('route')) {
      (mapInstance.getSource('route') as mapboxgl.GeoJSONSource).setData({
        type: 'Feature',
        properties: {},
        geometry: route
      });
    } else {
      mapInstance.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: route
        }
      });

      mapInstance.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 4,
          'line-opacity': 0.75
        }
      });
    }
  };

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}
      <div ref={mapContainer} className="w-full h-full min-h-[400px]" />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { Loader2 } from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || '';

// Use Mapbox geocoding API directly instead of edge function
async function geocodeWithMapbox(address: string): Promise<{ lat: number; lon: number } | null> {
  if (!address || address.trim() === '') return null;
  
  try {
    const encodedAddress = encodeURIComponent(address);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&limit=1`
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
        mapboxgl.accessToken = MAPBOX_TOKEN;
        
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
          const pickupCoords = await geocodeWithMapbox(pickupAddress);
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
          const deliveryCoords = await geocodeWithMapbox(deliveryAddress);
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
              const pickupCoords = await geocodeWithMapbox(pickupAddress);
              if (pickupCoords) {
                await drawRoute(
                  map.current,
                  [truckLocation.longitude, truckLocation.latitude],
                  [pickupCoords.lon, pickupCoords.lat],
                  [deliveryCoords.lon, deliveryCoords.lat]
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
    deliveryCoords: [number, number]
  ) => {
    try {
      // Get route from Mapbox Directions API
      const coordinates = `${truckCoords[0]},${truckCoords[1]};${pickupCoords[0]},${pickupCoords[1]};${deliveryCoords[0]},${deliveryCoords[1]}`;
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
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

  useEffect(() => {
    if (!mapContainer.current) return;

    const initializeMap = async () => {
      setIsLoading(true);
      
      try {
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
        mapboxgl.accessToken = MAPBOX_TOKEN;
        
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

        // Determine routing logic based on order status
        const shouldRouteToPickup = !hasBOL && !pickupArrived;
        const shouldRouteToDelivery = hasBOL && !hasPOD;

        let pickupCoords = null;
        let deliveryCoords = null;

        // Create comprehensive load information popup
        const loadInfoPopup = `
          <div style="min-width: 450px; padding: 12px; font-size: 13px; font-family: system-ui, -apple-system, sans-serif;">
            <strong style="font-size: 17px; display: block; margin-bottom: 10px; color: #1f2937;">Load Information</strong>
            ${loadNumber ? `<div style="margin-bottom: 8px;"><strong>Load #:</strong> ${loadNumber}</div>` : ''}
            ${brokerLoadNumber ? `<div style="margin-bottom: 8px;"><strong>Broker Load #:</strong> ${brokerLoadNumber}</div>` : ''}
            ${pickupAddress ? `<div style="margin-bottom: 8px; word-wrap: break-word;"><strong>Pickup:</strong> ${pickupAddress}${pickupDate ? ` at ${pickupDate}${pickupTime ? `, ${pickupTime}` : ''}` : ''}</div>` : ''}
            ${deliveryAddress ? `<div style="margin-bottom: 8px; word-wrap: break-word;"><strong>Delivery:</strong> ${deliveryAddress}${deliveryDate ? ` at ${deliveryDate}${deliveryTime ? `, ${deliveryTime}` : ''}` : ''}</div>` : ''}
          </div>
        `;

        // Always show pickup marker if address exists
        if (pickupAddress) {
          pickupCoords = await geocodeWithMapbox(pickupAddress);
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

        // Always show delivery marker if address exists
        if (deliveryAddress) {
          deliveryCoords = await geocodeWithMapbox(deliveryAddress);
          if (deliveryCoords) {
            const deliveryEl = document.createElement('div');
            deliveryEl.className = 'delivery-marker';
            deliveryEl.innerHTML = '🎯';
            deliveryEl.style.fontSize = '32px';
            
            new mapboxgl.Marker(deliveryEl)
              .setLngLat([deliveryCoords.lon, deliveryCoords.lat])
              .addTo(map.current);

            bounds.extend([deliveryCoords.lon, deliveryCoords.lat]);
          }
        }

        // Draw route based on status
        if (shouldRouteToPickup && pickupCoords) {
          await drawRouteToDestination(
            map.current,
            [truckLocation.longitude, truckLocation.latitude],
            [pickupCoords.lon, pickupCoords.lat]
          );
        } else if (shouldRouteToDelivery && deliveryCoords) {
          await drawRouteToDestination(
            map.current,
            [truckLocation.longitude, truckLocation.latitude],
            [deliveryCoords.lon, deliveryCoords.lat]
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
  }, [locations, truckId, truckNumber, pickupAddress, deliveryAddress, hasBOL, hasPOD, pickupArrived]);

  const drawRouteToDestination = async (
    mapInstance: mapboxgl.Map,
    startCoords: [number, number],
    endCoords: [number, number]
  ) => {
    try {
      const coordinates = `${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}`;
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?geometries=geojson&access_token=${MAPBOX_TOKEN}`
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

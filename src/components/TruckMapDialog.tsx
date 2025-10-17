import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { geocodeAddress } from '@/utils/routeCalculation';
import { Loader2 } from 'lucide-react';

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
  
  const MAPBOX_TOKEN = 'pk.eyJ1Ijoiam9udzEyMyIsImEiOiJjbWdmOHE2dnAwNWI0MmpzY3NlOXY5NHBxIn0.sb-KPJmlqi33w5aDMMRPzA';

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

        // Add truck marker (blue color)
        const truckEl = document.createElement('div');
        truckEl.className = 'truck-marker';
        truckEl.style.width = '32px';
        truckEl.style.height = '32px';
        truckEl.style.borderRadius = '50%';
        truckEl.style.backgroundColor = '#3b82f6'; // blue-500
        truckEl.style.border = '3px solid white';
        truckEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
        truckEl.style.display = 'flex';
        truckEl.style.alignItems = 'center';
        truckEl.style.justifyContent = 'center';
        truckEl.innerHTML = '<div style="color: white; font-size: 18px; font-weight: bold;">🚚</div>';
        
        new mapboxgl.Marker(truckEl)
          .setLngLat([truckLocation.longitude, truckLocation.latitude])
          .addTo(map.current);

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([truckLocation.longitude, truckLocation.latitude]);

        // Geocode and add pickup marker (cyan color)
        if (pickupAddress) {
          const pickupCoords = await geocodeAddress(pickupAddress);
          if (pickupCoords) {
            const pickupEl = document.createElement('div');
            pickupEl.className = 'pickup-marker';
            pickupEl.style.width = '30px';
            pickupEl.style.height = '30px';
            pickupEl.style.borderRadius = '50% 50% 50% 0';
            pickupEl.style.backgroundColor = '#06b6d4'; // cyan-500
            pickupEl.style.border = '3px solid white';
            pickupEl.style.transform = 'rotate(-45deg)';
            pickupEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
            
            new mapboxgl.Marker(pickupEl)
              .setLngLat([pickupCoords.lon, pickupCoords.lat])
              .addTo(map.current);

            bounds.extend([pickupCoords.lon, pickupCoords.lat]);
          }
        }

        // Geocode and add delivery marker (red color)
        if (deliveryAddress) {
          const deliveryCoords = await geocodeAddress(deliveryAddress);
          if (deliveryCoords) {
            const deliveryEl = document.createElement('div');
            deliveryEl.className = 'delivery-marker';
            deliveryEl.style.width = '30px';
            deliveryEl.style.height = '30px';
            deliveryEl.style.borderRadius = '50% 50% 50% 0';
            deliveryEl.style.backgroundColor = '#ef4444'; // red-500
            deliveryEl.style.border = '3px solid white';
            deliveryEl.style.transform = 'rotate(-45deg)';
            deliveryEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
            
            new mapboxgl.Marker(deliveryEl)
              .setLngLat([deliveryCoords.lon, deliveryCoords.lat])
              .addTo(map.current);

            bounds.extend([deliveryCoords.lon, deliveryCoords.lat]);

            // If we have both pickup and delivery, draw a route
            if (pickupAddress) {
              const pickupCoords = await geocodeAddress(pickupAddress);
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
  
  const MAPBOX_TOKEN = 'pk.eyJ1Ijoiam9udzEyMyIsImEiOiJjbWdmOHE2dnAwNWI0MmpzY3NlOXY5NHBxIn0.sb-KPJmlqi33w5aDMMRPzA';

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

        // Add truck marker (blue color)
        const truckEl = document.createElement('div');
        truckEl.className = 'truck-marker';
        truckEl.style.width = '32px';
        truckEl.style.height = '32px';
        truckEl.style.borderRadius = '50%';
        truckEl.style.backgroundColor = '#3b82f6'; // blue-500
        truckEl.style.border = '3px solid white';
        truckEl.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
        truckEl.style.display = 'flex';
        truckEl.style.alignItems = 'center';
        truckEl.style.justifyContent = 'center';
        truckEl.innerHTML = '<div style="color: white; font-size: 18px; font-weight: bold;">🚚</div>';
        
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

        // Always show pickup marker if address exists (cyan color)
        if (pickupAddress) {
          pickupCoords = await geocodeAddress(pickupAddress);
          if (pickupCoords) {
            const pickupEl = document.createElement('div');
            pickupEl.className = 'pickup-marker';
            pickupEl.style.width = '30px';
            pickupEl.style.height = '30px';
            pickupEl.style.borderRadius = '50% 50% 50% 0';
            pickupEl.style.backgroundColor = '#06b6d4'; // cyan-500
            pickupEl.style.border = '3px solid white';
            pickupEl.style.transform = 'rotate(-45deg)';
            pickupEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
            
            new mapboxgl.Marker(pickupEl)
              .setLngLat([pickupCoords.lon, pickupCoords.lat])
              .addTo(map.current);

            bounds.extend([pickupCoords.lon, pickupCoords.lat]);
          }
        }

        // Always show delivery marker if address exists (red color)
        if (deliveryAddress) {
          deliveryCoords = await geocodeAddress(deliveryAddress);
          if (deliveryCoords) {
            const deliveryEl = document.createElement('div');
            deliveryEl.className = 'delivery-marker';
            deliveryEl.style.width = '30px';
            deliveryEl.style.height = '30px';
            deliveryEl.style.borderRadius = '50% 50% 50% 0';
            deliveryEl.style.backgroundColor = '#ef4444'; // red-500
            deliveryEl.style.border = '3px solid white';
            deliveryEl.style.transform = 'rotate(-45deg)';
            deliveryEl.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
            
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

    const drawRouteToDestination = async (
      mapInstance: mapboxgl.Map,
      truckCoords: [number, number],
      destinationCoords: [number, number]
    ) => {
      try {
        // Get route from OSRM (same as distance calculations)
        const coordinates = `${truckCoords[0]},${truckCoords[1]};${destinationCoords[0]},${destinationCoords[1]}`;
        const response = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`
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

    initializeMap();

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [locations, truckId, truckNumber, pickupAddress, deliveryAddress]);

  return (
    <div className="relative w-full h-[500px]" style={{ zIndex: 101 }}>
      <div className="absolute top-2 left-2 z-10 bg-background/95 px-3 py-1.5 rounded-md shadow-md">
        <p className="text-sm font-semibold">Truck {truckNumber} - Live Location & Route</p>
      </div>
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
      <div ref={mapContainer} className="w-full h-full rounded-lg" />
    </div>
  );
}

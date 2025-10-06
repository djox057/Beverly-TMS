import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useSamsaraLocations } from '@/hooks/useSamsaraLocations';
import { geocodeAddress } from '@/utils/geocoding';
import { Loader2 } from 'lucide-react';

interface TruckMapDialogProps {
  truckNumber: string;
  truckId: string;
  pickupAddress?: string;
  deliveryAddress?: string;
  children: React.ReactNode;
}

export function TruckMapDialog({
  truckNumber,
  truckId,
  pickupAddress,
  deliveryAddress,
  children,
}: TruckMapDialogProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isOpen, setIsOpen] = useState(false);
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

        // Add truck marker
        const truckEl = document.createElement('div');
        truckEl.className = 'truck-marker';
        truckEl.innerHTML = '🚚';
        truckEl.style.fontSize = '32px';
        
        new mapboxgl.Marker(truckEl)
          .setLngLat([truckLocation.longitude, truckLocation.latitude])
          .setPopup(
            new mapboxgl.Popup().setHTML(
              `<strong>${truckNumber}</strong><br/>Current Location`
            )
          )
          .addTo(map.current);

        const bounds = new mapboxgl.LngLatBounds();
        bounds.extend([truckLocation.longitude, truckLocation.latitude]);

        // Geocode and add pickup marker
        if (pickupAddress) {
          const pickupCoords = await geocodeAddress(pickupAddress);
          if (pickupCoords) {
            const pickupEl = document.createElement('div');
            pickupEl.className = 'pickup-marker';
            pickupEl.innerHTML = '📍';
            pickupEl.style.fontSize = '32px';
            
            new mapboxgl.Marker(pickupEl)
              .setLngLat([pickupCoords.longitude, pickupCoords.latitude])
              .setPopup(
                new mapboxgl.Popup().setHTML(
                  `<strong>Pickup</strong><br/>${pickupAddress}`
                )
              )
              .addTo(map.current);

            bounds.extend([pickupCoords.longitude, pickupCoords.latitude]);
          }
        }

        // Geocode and add delivery marker
        if (deliveryAddress) {
          const deliveryCoords = await geocodeAddress(deliveryAddress);
          if (deliveryCoords) {
            const deliveryEl = document.createElement('div');
            deliveryEl.className = 'delivery-marker';
            deliveryEl.innerHTML = '🎯';
            deliveryEl.style.fontSize = '32px';
            
            new mapboxgl.Marker(deliveryEl)
              .setLngLat([deliveryCoords.longitude, deliveryCoords.latitude])
              .setPopup(
                new mapboxgl.Popup().setHTML(
                  `<strong>Delivery</strong><br/>${deliveryAddress}`
                )
              )
              .addTo(map.current);

            bounds.extend([deliveryCoords.longitude, deliveryCoords.latitude]);

            // If we have both pickup and delivery, draw a route
            if (pickupAddress) {
              const pickupCoords = await geocodeAddress(pickupAddress);
              if (pickupCoords) {
                await drawRoute(
                  map.current,
                  [truckLocation.longitude, truckLocation.latitude],
                  [pickupCoords.longitude, pickupCoords.latitude],
                  [deliveryCoords.longitude, deliveryCoords.latitude]
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
        
        mapInstance.on('load', () => {
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
        });
      }
    } catch (error) {
      console.error('Error drawing route:', error);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent 
        className="w-[800px] h-[600px] p-0" 
        style={{ zIndex: 101 }}
        align="start"
        side="bottom"
      >
        <div className="relative w-full h-full">
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
      </PopoverContent>
    </Popover>
  );
}

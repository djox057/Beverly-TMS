export interface TruckCoordinates { lat: number; lon: number }

/** Same road-distance estimate used by Reports nearby-truck search. */
export function estimatedRoadMiles(a: TruckCoordinates, b: TruckCoordinates): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians;
  const dLon = (b.lon - a.lon) * radians;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return Math.round(3959 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h))) * 1.3);
}

interface DeliveryStop {
  type: string; sequence_number: number; datetime?: string | null; end_datetime?: string | null;
  latitude: number | null; longitude: number | null;
}
export interface TruckDeliveryCandidate {
  id: string;
  orders: { delivery_datetime: string | null; delivery_end_datetime: string | null; pickup_drops: DeliveryStop[] }[];
}

export function suggestedPrebookTrucks(trucks: TruckDeliveryCandidate[], pickup: TruckCoordinates, pickupDatetime: string) {
  const cutoff = Date.parse(pickupDatetime);
  if (!Number.isFinite(cutoff)) return [];
  return trucks.flatMap(truck => {
    // The query supplies only the latest assigned load starting before pickup.
    // A load delivering after pickup must not fall back to an older nearby load.
    const order = truck.orders[0];
    if (!order) return [];
    const lastDrop = [...order.pickup_drops].filter(stop => stop.type === 'delivery')
      .sort((a, b) => b.sequence_number - a.sequence_number)[0];
    const deliveryDatetime = lastDrop?.end_datetime || order.delivery_end_datetime || lastDrop?.datetime || order.delivery_datetime || '';
    const end = Date.parse(deliveryDatetime);
    // Match the scheduled calendar dates displayed for the load, rather than
    // suggesting trucks whose last delivery was on an earlier day.
    if (!Number.isFinite(end) || deliveryDatetime.slice(0, 10) !== pickupDatetime.slice(0, 10)
      || end > cutoff || lastDrop?.latitude == null || lastDrop.longitude == null) return [];
    const lat = Number(lastDrop.latitude), lon = Number(lastDrop.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
    const miles = estimatedRoadMiles(pickup, { lat, lon });
    return miles <= 150 ? [{ id: truck.id, miles }] : [];
  }).sort((a, b) => a.miles - b.miles || a.id.localeCompare(b.id));
}

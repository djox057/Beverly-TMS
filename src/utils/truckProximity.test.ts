import { expect, it } from 'vitest';
import { estimatedRoadMiles, suggestedPrebookTrucks, type TruckDeliveryCandidate } from './truckProximity';
const pickup = { lat: 40, lon: -90 };
const cutoff = '2026-10-21T12:00:00+00:00';
const truck = (id: string, lat: number | null, end = '2026-10-21T08:00:00+00:00'): TruckDeliveryCandidate => ({ id, orders: [{ delivery_datetime: end, delivery_end_datetime: end, pickup_drops: [
  { type: 'pickup', sequence_number: 1, latitude: 20, longitude: -90 },
  { type: 'delivery', sequence_number: 2, latitude: 45, longitude: -90 },
  { type: 'delivery', sequence_number: 3, latitude: lat, longitude: -90, end_datetime: end },
] }] });
it('uses the same rounded 1.3 road-mile estimate as Reports', () => {
  expect(estimatedRoadMiles(pickup, {lat: 41, lon: -90})).toBe(90);
});
it('uses the final delivery, caps at 150 miles and sorts closest first', () => {
  expect(suggestedPrebookTrucks([truck('far', 42), truck('90-mi', 41), truck('45-mi', 40.5)], pickup, cutoff))
    .toEqual([{ id: '45-mi', miles: 45 }, { id: '90-mi', miles: 90 }]);
});
it('includes the 150-mile boundary and excludes 151 miles', () => {
  expect(suggestedPrebookTrucks([truck('outside', 41.68), truck('boundary', 41.67)], pickup, cutoff))
    .toEqual([{id: 'boundary', miles: 150}]);
});
it('excludes missing locations, unknown dates, and deliveries after pickup', () => {
  expect(suggestedPrebookTrucks([truck('no-coordinates', null), truck('after', 40, '2026-10-22T08:00:00+00:00'), truck('invalid-date', 40, 'bad'), { id: 'no-history', orders: [] }], pickup, cutoff)).toEqual([]);
});
it('does not fall back to an older nearby delivery when the latest load finishes too late', () => {
  const candidate = truck('overlapping', 40, '2026-10-22T08:00:00+00:00');
  candidate.orders.push(truck('old', 40).orders[0]);
  expect(suggestedPrebookTrucks([candidate], pickup, cutoff)).toEqual([]);
});

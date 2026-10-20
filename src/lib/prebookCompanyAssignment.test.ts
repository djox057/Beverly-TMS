import { expect, it } from 'vitest';
import { canAssignPrebookTruck } from './prebookCompanyAssignment';

it.each(['BF Prime LLC','AP Silver Trans LLC','United Enterprise Solutions INC','Jones Freight Lines LLC'])('allows %s trucks for BF Prime loads', company => {
  expect(canAssignPrebookTruck('BF Prime LLC',company)).toBe(true);
});
it.each(['Beverly Freight Inc','BF Prime United LLC','BG Prime Inc','Lale Transport LLC',null])('excludes %s trucks from BF Prime loads', company => {
  expect(canAssignPrebookTruck('BF Prime LLC',company)).toBe(false);
});
it.each(['BF Prime LLC','AP Silver Trans LLC','United Enterprise Solutions INC','Jones Freight Lines LLC','BF Prime United LLC',null])('excludes %s trucks from Beverly Freight loads', company => {
  expect(canAssignPrebookTruck('Beverly Freight Inc',company)).toBe(false);
});
it('allows Beverly Freight trucks for Beverly Freight loads and ignores capitalization',()=>{
  expect(canAssignPrebookTruck('BEVERLY FREIGHT INC','Beverly Freight Inc')).toBe(true);
});
it('waits for the booking company instead of exposing unfiltered trucks',()=>{
  expect(canAssignPrebookTruck(null,'BF Prime LLC')).toBe(false);
});

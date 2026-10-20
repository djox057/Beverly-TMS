import { getCompanySuffix } from '@/utils/formatInternalLoadNumber';

export function canAssignPrebookTruck(bookingCompany: string | null | undefined, truckCompany: string | null | undefined): boolean {
  if (!bookingCompany) return false;
  const booking = getCompanySuffix(bookingCompany), truck = getCompanySuffix(truckCompany);
  if (booking === 'BFP') return ['BFP', 'AP', 'UE', 'JF'].includes(truck);
  if (booking === 'BF') return truck === 'BF';
  return true;
}

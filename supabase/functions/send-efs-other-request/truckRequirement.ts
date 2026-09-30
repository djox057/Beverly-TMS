/** Only the selected driver's database flag can waive the truck requirement. */
export async function getTruckRequirementError(
  truckNumber: string,
  driverId: unknown,
  lookupRecovery: (driverId: string) => Promise<boolean>,
): Promise<string | null> {
  if (truckNumber.trim()) return null;
  const validDriverId = typeof driverId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(driverId);
  if (validDriverId && await lookupRecovery(driverId) === true) return null;
  return "Truck number is required unless the selected driver is marked as Recovery.";
}

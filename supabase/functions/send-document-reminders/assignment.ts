interface DriverAssignment {
  id: string;
  name: string;
  dispatcher_id: string | null;
}

interface TruckAssignment {
  driver1_id: string | null;
  driver2_id: string | null;
  dispatcher_id: string | null;
}

/** Only send truck-linked reminders when an active driver and a dispatcher can be resolved. */
export function assignedTruckContext(
  truck: TruckAssignment | null | undefined,
  activeDrivers: Map<string, DriverAssignment>,
): { driverName: string; dispatcherId: string } | null {
  if (!truck) return null;
  const drivers = [truck.driver1_id, truck.driver2_id]
    .map((id) => id ? activeDrivers.get(id) : null)
    .filter((driver): driver is DriverAssignment => !!driver);
  const dispatcherId = drivers[0]?.dispatcher_id ?? truck.dispatcher_id ?? drivers[1]?.dispatcher_id ?? null;
  return drivers.length && dispatcherId
    ? { driverName: drivers[0].name, dispatcherId }
    : null;
}

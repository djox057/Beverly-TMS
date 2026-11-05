// Reports uses synthetic row IDs for drivers without assigned trucks.
export function finalUpdateIdentity(rowId: string, driverId?: string | null) {
  return rowId.startsWith('driver-')
    ? { truck_id: null, driver_id: driverId || rowId.slice('driver-'.length) }
    : { truck_id: rowId, driver_id: driverId || null };
}

export function finalUpdateRowId(record: { truck_id: string | null; driver_id: string | null }) {
  return record.truck_id || (record.driver_id ? `driver-${record.driver_id}` : null);
}

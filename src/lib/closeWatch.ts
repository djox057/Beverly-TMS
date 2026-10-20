export const isCloseWatchUrgent = (truck: { driveMinutes?: number | null }) =>
  typeof truck.driveMinutes === "number" && Number.isFinite(truck.driveMinutes) && truck.driveMinutes < 60;

/** Keep dispatcher sections, but place every urgent section before the rest. */
export function closeWatchGroups<T extends { dispatcherId: string; trucks: any[] }>(groups: T[]): T[] {
  return [true, false].flatMap(urgent => groups.flatMap(group => {
    const trucks = group.trucks.filter(truck => truck.closeWatch === true && isCloseWatchUrgent(truck) === urgent);
    return trucks.length ? [{ ...group, closeWatchSection: urgent ? "urgent" : "regular", trucks }] : [];
  }));
}

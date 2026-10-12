type AssignedTruck = { id: string; is_active: boolean; driver1_id: string | null; driver2_id?: string | null };

export function isAssignedPretripTruck(truck: AssignedTruck): boolean {
  return truck.is_active && Boolean(truck.driver1_id || truck.driver2_id);
}

/** Inputs contain only the selected week's submissions and pictures. Count trucks once. */
export function pretripCompletionCount(
  trucks: readonly { id: string }[],
  formsByTruck: Record<string, readonly { status: string }[]>,
  photosByTruck: Record<string, readonly unknown[]>,
) {
  const ids = new Set(trucks.map((truck) => truck.id));
  const completed = [...ids].filter((id) =>
    formsByTruck[id]?.some((form) => form.status !== "superseded") || (photosByTruck[id]?.length ?? 0) > 0,
  ).length;
  return { completed, total: ids.size, remaining: ids.size - completed };
}

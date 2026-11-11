/** Empty selection means all; a selected team includes its supervisor. */
export function matchesSupervisorFilter(
  dispatcherId: string | null | undefined,
  selected: readonly string[],
  assignments: Readonly<Record<string, string>>,
): boolean {
  return selected.length === 0 || !!dispatcherId && (
    selected.includes(dispatcherId) || selected.includes(assignments[dispatcherId])
  );
}

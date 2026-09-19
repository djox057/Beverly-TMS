/**
 * PostgREST returns at most 1000 rows per request. Any query that can grow
 * past that must be paged, otherwise rows are silently dropped.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from('afterhours_assignments').select('*').in('scheduled_date', dates).range(from, to)
 *   );
 */
export const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize: number = PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  // Hard safety stop at 100 pages (100k rows).
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data || [];
    out.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

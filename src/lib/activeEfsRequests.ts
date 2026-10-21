type EfsQueryResult<T> = {
  data: T | null;
  error: { code?: string; message: string } | null;
};

/** Support deployments where the void migration has not been applied yet.
 * Retry only a missing void column; permission and other failures stay errors.
 */
export async function fetchActiveEfsRows<T>(
  query: (activeOnly: boolean) => PromiseLike<EfsQueryResult<T>>,
): Promise<EfsQueryResult<T>> {
  const result = await query(true);
  if (result.error && ["42703", "PGRST204"].includes(result.error.code || "")
    && result.error.message.includes("voided_at")) {
    return query(false);
  }
  return result;
}

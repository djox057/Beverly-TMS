const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check whether a string is a valid UUID v4 (or any standard UUID format).
 * Used defensively before passing values to Supabase queries that expect uuid columns.
 */
export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

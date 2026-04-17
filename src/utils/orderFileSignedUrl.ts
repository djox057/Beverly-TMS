/**
 * Self-healing signed URL helper for order files.
 *
 * The Reports adapter keeps a module-level cache of `order_files`. RC files
 * are fully replaced (delete + insert) on upload, so if a realtime event is
 * missed (tab backgrounded, websocket dropped, subscription not yet active),
 * the cache can hold a stale `file_path` that no longer exists in storage and
 * `createSignedUrl` returns HTTP 400 "Object not found".
 *
 * This helper wraps `createSignedUrl` so that on failure it:
 *   1. Re-fetches the canonical row from `order_files` by id (or by
 *      `order_id + file_category` if the row was deleted).
 *   2. Updates the in-memory cache via `invalidateOrderFilesCacheForOrder`.
 *   3. Retries `createSignedUrl` once with the fresh path.
 */
import { supabase } from "@/integrations/supabase/client";
import { invalidateOrderFilesCacheForOrder } from "@/hooks/useReportsDateWindowAdapter";

export interface OrderFileLike {
  id: string;
  order_id?: string | null;
  file_category?: string | null;
  file_name?: string | null;
  file_path: string;
}

export interface SignedUrlResult {
  /** Signed URL if successful, otherwise null. */
  signedUrl: string | null;
  /** Possibly-updated file path (when refetched, this differs from input). */
  filePath: string;
  /** Last error encountered, only set when `signedUrl` is null. */
  error?: Error;
}

const EXPIRES_IN_DEFAULT = 3600;

/**
 * Get a signed URL for an order file. On failure, attempt to recover from a
 * stale cache by refetching the row from the database and retrying once.
 */
export async function getOrderFileSignedUrl(
  file: OrderFileLike,
  expiresIn: number = EXPIRES_IN_DEFAULT,
): Promise<SignedUrlResult> {
  // First attempt with the path we have.
  const first = await supabase.storage
    .from("order-files")
    .createSignedUrl(file.file_path, expiresIn);

  if (first.data?.signedUrl) {
    return { signedUrl: first.data.signedUrl, filePath: file.file_path };
  }

  // Recovery path: try to find the canonical row.
  // 1) by id (handles renames / path changes)
  let freshPath: string | null = null;

  try {
    const { data: byId } = await supabase
      .from("order_files")
      .select("file_path, order_id")
      .eq("id", file.id)
      .maybeSingle();

    if (byId?.file_path && byId.file_path !== file.file_path) {
      freshPath = byId.file_path;
      invalidateOrderFilesCacheForOrder(byId.order_id || file.order_id);
    } else if (!byId && file.order_id && file.file_category) {
      // 2) by order_id + category (handles delete-then-insert RC replacement)
      const { data: byCategory } = await supabase
        .from("order_files")
        .select("file_path, order_id")
        .eq("order_id", file.order_id)
        .eq("file_category", file.file_category)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byCategory?.file_path) {
        freshPath = byCategory.file_path;
        invalidateOrderFilesCacheForOrder(byCategory.order_id || file.order_id);
      }
    }
  } catch (lookupErr) {
    console.error("[orderFileSignedUrl] Lookup failed:", lookupErr);
  }

  if (!freshPath) {
    return {
      signedUrl: null,
      filePath: file.file_path,
      error: first.error || new Error("File not found"),
    };
  }

  // Retry with fresh path.
  const retry = await supabase.storage
    .from("order-files")
    .createSignedUrl(freshPath, expiresIn);

  if (retry.data?.signedUrl) {
    return { signedUrl: retry.data.signedUrl, filePath: freshPath };
  }

  return {
    signedUrl: null,
    filePath: freshPath,
    error: retry.error || new Error("File not found"),
  };
}

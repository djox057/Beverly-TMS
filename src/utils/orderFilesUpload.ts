import { supabase } from "@/integrations/supabase/client";

const ORDER_FILES_BUCKET = "order-files";

const isConflictError = (error: any): boolean => {
  const status = (error as any)?.statusCode ?? (error as any)?.status;
  const msg = String((error as any)?.message ?? "");
  return status === 409 || /already exists|conflict/i.test(msg);
};

const isTransientUploadError = (error: any): boolean => {
  if (!error) return false;
  const status = Number((error as any)?.statusCode ?? (error as any)?.status ?? 0);
  if ([0, 408, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  const name = String((error as any)?.name ?? "");
  if (name === "AbortError" || name === "TimeoutError") return true;
  const msg = String((error as any)?.message ?? error ?? "");
  return (
    /Failed to fetch|NetworkError|network|fetch failed|load failed|aborted|timeout|body stream|stream already read|ECONN|socket hang up/i.test(
      msg,
    )
  );
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read the File once into an ArrayBuffer and wrap it in a fresh Blob.
 * Edge browser intermittently fails to re-stream the same File reference on
 * retries or after the form re-renders (manifests as aborted upload /
 * "body stream already read"). Uploading a buffered Blob avoids that.
 */
const bufferFileForUpload = async (
  file: File,
): Promise<{ body: Blob; contentType: string }> => {
  const contentType = file.type || "application/octet-stream";
  try {
    const buf = await file.arrayBuffer();
    return { body: new Blob([buf], { type: contentType }), contentType };
  } catch {
    // Fall back to the raw File if reading fails for any reason.
    return { body: file, contentType };
  }
};

const uploadWithRetry = async (
  path: string,
  body: Blob,
  contentType: string,
): Promise<{ error: any | null }> => {
  const delays = [0, 300, 900, 2500];
  let lastError: any = null;
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleep(delays[i]);
    const { error } = await supabase.storage
      .from(ORDER_FILES_BUCKET)
      .upload(path, body, { upsert: false, contentType });
    if (!error) return { error: null };
    lastError = error;
    if (isConflictError(error)) return { error };
    if (!isTransientUploadError(error)) return { error };
    console.warn(
      `[orderFilesUpload] transient upload error (attempt ${i + 1}/${delays.length}) for ${path}:`,
      (error as any)?.message || error,
    );
  }
  return { error: lastError };
};

/**
 * Sanitizes a filename for Supabase Storage by:
 * - Replacing spaces, hyphens, and path separators with underscores
 * - Removing all characters except alphanumeric, underscores, dots, and parentheses
 * - Collapsing consecutive underscores
 */
export const sanitizeFileName = (name: string): string => {
  return name
    // Replace path separators, spaces, hyphens with underscores
    .replace(/[\\/\s\-]+/g, "_")
    // Remove everything except alphanumeric, underscores, dots, parentheses
    .replace(/[^a-zA-Z0-9_.()]/g, "")
    // Collapse multiple underscores into one
    .replace(/_+/g, "_")
    // Collapse multiple dots (but keep single dots for extensions)
    .replace(/\.{2,}/g, ".")
    // Remove leading/trailing underscores or dots
    .replace(/^[_.]+|[_.]+$/g, "");
};

const getExtension = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot > 0 && lastDot < fileName.length - 1) {
    return fileName.slice(lastDot);
  }
  return "";
};

const addCopySuffix = (fileName: string, copyNumber: number): string => {
  if (copyNumber <= 1) return fileName;
  const safe = sanitizeFileName(fileName);
  const lastDot = safe.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < safe.length - 1;
  const base = hasExt ? safe.slice(0, lastDot) : safe;
  const ext = hasExt ? safe.slice(lastDot) : "";
  return `${base} (${copyNumber})${ext}`;
};

/**
 * Uploads a file to the `order-files` bucket while preserving the original filename.
 * If the name already exists, appends " (2)", " (3)", ... before the extension.
 * If all attempts fail due to non-conflict errors, falls back to a UUID-based filename.
 */
export const uploadOrderFilePreserveName = async (params: {
  orderId: string;
  folder: string; // e.g. RC, POD, BOL, ADDITIONAL, additional
  file: File;
  maxTries?: number;
}): Promise<string> => {
  const { orderId, folder, file, maxTries = 50 } = params;

  const originalName = sanitizeFileName(file.name);

  // Buffer once so retries don't re-stream a (possibly consumed) File reference.
  const { body, contentType } = await bufferFileForUpload(file);

  // Try with sanitized original name (+ copy suffixes)
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const candidateName = addCopySuffix(originalName, attempt);
    const candidatePath = `${orderId}/${folder}/${candidateName}`;

    const { error } = await uploadWithRetry(candidatePath, body, contentType);

    if (!error) return candidatePath;
    if (isConflictError(error)) continue;

    // Non-conflict error — break and try UUID fallback
    console.warn("Upload failed with sanitized name, trying UUID fallback:", error.message);
    break;
  }

  // UUID fallback — guaranteed unique name
  const ext = getExtension(file.name) || ".bin";
  const uuidName = `${crypto.randomUUID()}${ext}`;
  const fallbackPath = `${orderId}/${folder}/${uuidName}`;

  const { error: fallbackError } = await uploadWithRetry(fallbackPath, body, contentType);

  if (!fallbackError) return fallbackPath;

  throw fallbackError;
};

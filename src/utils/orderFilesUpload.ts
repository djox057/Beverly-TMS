import { supabase } from "@/integrations/supabase/client";

const ORDER_FILES_BUCKET = "order-files";

const isConflictError = (error: any): boolean => {
  const status = (error as any)?.statusCode ?? (error as any)?.status;
  const msg = String((error as any)?.message ?? "");
  return status === 409 || /already exists|conflict/i.test(msg);
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

  // Try with sanitized original name (+ copy suffixes)
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const candidateName = addCopySuffix(originalName, attempt);
    const candidatePath = `${orderId}/${folder}/${candidateName}`;

    const { error } = await supabase.storage
      .from(ORDER_FILES_BUCKET)
      .upload(candidatePath, file, { upsert: false });

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

  const { error: fallbackError } = await supabase.storage
    .from(ORDER_FILES_BUCKET)
    .upload(fallbackPath, file, { upsert: false });

  if (!fallbackError) return fallbackPath;

  throw fallbackError;
};

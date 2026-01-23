import { supabase } from "@/integrations/supabase/client";

const ORDER_FILES_BUCKET = "order-files";

const isConflictError = (error: any): boolean => {
  const status = (error as any)?.statusCode ?? (error as any)?.status;
  const msg = String((error as any)?.message ?? "");
  return status === 409 || /already exists|conflict/i.test(msg);
};

const removePathSeparators = (name: string): string => name.replace(/[\\/]/g, "_");

const addCopySuffix = (fileName: string, copyNumber: number): string => {
  if (copyNumber <= 1) return fileName;
  const safe = removePathSeparators(fileName);
  const lastDot = safe.lastIndexOf(".");
  const hasExt = lastDot > 0 && lastDot < safe.length - 1;
  const base = hasExt ? safe.slice(0, lastDot) : safe;
  const ext = hasExt ? safe.slice(lastDot) : "";
  return `${base} (${copyNumber})${ext}`;
};

/**
 * Uploads a file to the `order-files` bucket while preserving the original filename.
 * If the name already exists, appends " (2)", " (3)", ... before the extension.
 */
export const uploadOrderFilePreserveName = async (params: {
  orderId: string;
  folder: string; // e.g. RC, POD, BOL, ADDITIONAL, additional
  file: File;
  maxTries?: number;
}): Promise<string> => {
  const { orderId, folder, file, maxTries = 50 } = params;

  const originalName = removePathSeparators(file.name);

  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const candidateName = addCopySuffix(originalName, attempt);
    const candidatePath = `${orderId}/${folder}/${candidateName}`;

    const { error } = await supabase.storage
      .from(ORDER_FILES_BUCKET)
      .upload(candidatePath, file, { upsert: false });

    if (!error) return candidatePath;
    if (isConflictError(error)) continue;

    throw error;
  }

  throw new Error(`Unable to upload file after ${maxTries} attempts (name collisions)`);
};

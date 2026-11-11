import { supabase } from "@/integrations/supabase/client";
import { STATEMENT_BUCKET, STATEMENT_MAX_BYTES } from "./tripStatement";

export type NewTripStatement = { truckNumber: string; driverName: string; weekStart: string; amount: number };

/** Insert only: the unique driver/truck/week constraint also protects concurrent imports. */
export async function insertTripStatement(file: File, target: NewTripStatement): Promise<void> {
  if (!file.name.toLowerCase().endsWith(".pdf") || file.size > STATEMENT_MAX_BYTES) throw new Error("Choose a PDF up to 20 MB.");
  const path = `${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage.from(STATEMENT_BUCKET).upload(path, file, { contentType: "application/pdf" });
  if (uploadError) throw new Error(uploadError.message);
  const { error } = await supabase.from("trip_week_statements").insert({
    truck_number: target.truckNumber, driver_name: target.driverName, week_start: target.weekStart,
    paid_amount: target.amount, file_name: file.name, file_path: path,
  }).select("id").single();
  if (error) {
    const cleanup = await supabase.storage.from(STATEMENT_BUCKET).remove([path]);
    if (cleanup.error) console.error("Unlinked bulk statement cleanup failed", cleanup.error);
    throw new Error(error.code === "23505" ? "A statement already exists. Replace it individually in Trips." : "Could not save statement. Try again.");
  }
}

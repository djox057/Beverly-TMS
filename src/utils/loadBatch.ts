export interface BatchLoadEntry {
  id: string;
  loadNumber: string;
  rc: File | null;
}

export const newBatchLoadEntry = (): BatchLoadEntry => ({ id: crypto.randomUUID(), loadNumber: "", rc: null });

export function validateBatchEntries(entries: BatchLoadEntry[]): string | null {
  if (entries.length < 2 || entries.length > 50) return "Multi load requires between 2 and 50 loads.";
  if (entries.some(entry => !entry.loadNumber.trim())) return "Enter a load number for every load.";
  const numbers = entries.map(entry => entry.loadNumber.replace(/[\s#]/g, "").toLowerCase());
  if (new Set(numbers).size !== numbers.length) return "Each load must have a different load number.";
  if (entries.some(entry => !entry.rc)) return "Upload one RC for each load.";
  return null;
}

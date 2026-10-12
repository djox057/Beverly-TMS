type DailySubmission = {
  id: string;
  submitted_at: string;
  inspection_date?: string | null;
  truck_id?: string | null;
  truck_number?: string;
  created_at?: string;
  source_row?: number;
};

/** Only the latest response per truck and inspection day is visible. Keep history intact. */
export function latestDailyPretripSubmissions<T extends DailySubmission>(submissions: readonly T[]): T[] {
  const latest = new Map<string, T>();
  const keyFor = (s: T) => {
    const date = s.inspection_date || s.submitted_at.slice(0, 10);
    const unit = s.truck_id || s.truck_number?.trim().toUpperCase() || "current-truck";
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${unit}:${date}` : `unknown:${s.id}`;
  };
  const rank = (s: T) => [s.submitted_at, s.source_row ?? 0, s.created_at ?? "", s.id] as const;
  for (const s of submissions) {
    const previous = latest.get(keyFor(s));
    const currentRank = rank(s), previousRank = previous && rank(previous);
    if (!previousRank || currentRank[0] > previousRank[0]
      || (currentRank[0] === previousRank[0] && (currentRank[1] > previousRank[1]
      || (currentRank[1] === previousRank[1] && `${currentRank[2]}:${currentRank[3]}` > `${previousRank[2]}:${previousRank[3]}`)))) latest.set(keyFor(s), s);
  }
  return submissions.filter((s) => latest.get(keyFor(s)) === s);
}

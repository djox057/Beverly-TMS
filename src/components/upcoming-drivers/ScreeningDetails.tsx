import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { candidateKey, fetchCandidate } from "./useUpcomingDrivers";
import { FIELD_LABELS, SCREENING_FIELDS, SCREENING_KEY_FIELDS, type CandidateFields } from "./model";

/**
 * Screening answers for one candidate, loaded only when the row is expanded so
 * the board itself stays light.
 */
export function ScreeningDetails({ id, onEdit }: { id: string; onEdit: (field: keyof CandidateFields) => void }) {
  const detail = useQuery({ queryKey: candidateKey(id), queryFn: () => fetchCandidate(id), staleTime: 60000 });

  if (detail.isPending) {
    return (
      <p className="flex items-center gap-2 px-8 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading answers…
      </p>
    );
  }
  if (detail.isError || !detail.data) {
    return <p role="alert" className="px-8 py-3 text-sm text-destructive">Could not load the answers for this driver.</p>;
  }

  const row = detail.data;
  const extraFields = SCREENING_FIELDS.filter((f) => !SCREENING_KEY_FIELDS.includes(f));
  const answer = (field: keyof CandidateFields) => String(row[field] ?? "").trim();
  const block = (fields: (keyof CandidateFields)[]) => (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => (
        <div key={field} className="min-w-0">
          <dt className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[field]}</dt>
          <dd>
            <button
              type="button"
              className="whitespace-pre-wrap break-words text-left text-sm hover:text-primary hover:underline"
              onClick={() => onEdit(field)}
            >
              {answer(field) || "—"}
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="sticky left-0 w-fit max-w-[min(1400px,95vw)] space-y-4 px-8 py-4">
      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Must know</h4>
        {block(SCREENING_KEY_FIELDS)}
      </section>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">Additional info</summary>
        <div className="pt-3">{block(extraFields)}</div>
      </details>
    </div>
  );
}

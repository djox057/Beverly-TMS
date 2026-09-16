import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { candidateKey, fetchCandidate } from "./useUpcomingDrivers";
import { FIELD_LABELS, SCREENING_FIELDS, type CandidateFields } from "./model";

/**
 * Everything not shown as a board column, loaded only when the row is expanded
 * so the board itself stays light. One block — no hidden sub-sections.
 */
const DETAIL_FIELDS: (keyof CandidateFields)[] = [
  ...SCREENING_FIELDS,
  "safety_id", "dispatcher_id", "sales", "timing_note", "application_status",
  "preference", "truck_terms", "drug_test_company", "ticket_note",
  "arrival_date", "arrival_time", "tentative",
];

export function ScreeningDetails({ id, onEdit, staff }: { id: string; onEdit: (field: keyof CandidateFields) => void; staff: { user_id: string; full_name: string }[] }) {
  const detail = useQuery({ queryKey: candidateKey(id), queryFn: () => fetchCandidate(id), staleTime: 60000 });

  if (detail.isPending) {
    return (
      <p className="flex items-center gap-2 px-8 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading answers…
      </p>
    );
  }
  if (detail.isError || !detail.data) {
    return <p role="alert" className="px-8 py-3 text-sm text-destructive">Could not load the details for this driver.</p>;
  }

  const row = detail.data;
  const answer = (field: keyof CandidateFields): string => {
    const value = row[field];
    if (value === null || value === undefined || value === "") return "—";
    if (field === "safety_id" || field === "dispatcher_id") return staff.find((s) => s.user_id === value)?.full_name || "Assigned user";
    if (field === "tentative") return value ? "Yes" : "No";
    return String(value);
  };

  return (
    <div className="sticky left-0 w-fit max-w-[min(1400px,95vw)] px-8 py-4">
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {DETAIL_FIELDS.map((field) => (
          <div key={field} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{FIELD_LABELS[field]}</dt>
            <dd>
              <button
                type="button"
                className="whitespace-pre-wrap break-words text-left text-sm hover:text-primary hover:underline"
                onClick={() => onEdit(field)}
              >
                {answer(field)}
              </button>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

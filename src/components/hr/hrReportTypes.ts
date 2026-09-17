export const HR_PROBLEM_TYPES = [
  "recruiting",
  "accounting",
  "maintenance",
  "dispatcher",
  "other",
] as const;

export type HrProblemType = (typeof HR_PROBLEM_TYPES)[number];

export const HR_PROBLEM_LABELS: Record<HrProblemType, string> = {
  recruiting: "Recruiting",
  accounting: "Accounting",
  maintenance: "Maintenance",
  dispatcher: "Dispatcher",
  other: "Other",
};

export interface HrReport {
  id: string;
  driver_name: string;
  truck_number: string;
  problem_type: string;
  problem_other: string | null;
  reason: string;
  updates: string | null;
  is_pinned: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  archived: boolean;
  archived_at: string | null;
  reviewed: boolean;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export const problemLabel = (r: Pick<HrReport, "problem_type" | "problem_other">) =>
  r.problem_type === "other"
    ? r.problem_other?.trim() || "Other"
    : HR_PROBLEM_LABELS[r.problem_type as HrProblemType] || r.problem_type;

export const HR_SEARCH_RANGES = [
  { value: "0.5", label: "Narrow" },
  { value: "0.3", label: "Balanced" },
  { value: "0.12", label: "Broad" },
] as const;

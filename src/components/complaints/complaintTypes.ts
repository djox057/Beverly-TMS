export const COMPLAINT_TYPES = [
  "hos",
  "gross_rpm",
  "dispatcher",
  "recruiting",
  "accounting",
  "maintenance",
  "trucks",
  "other",
] as const;

export type ComplaintTypeKey = (typeof COMPLAINT_TYPES)[number];

export const COMPLAINT_TYPE_LABELS: Record<ComplaintTypeKey, string> = {
  hos: "HOS",
  gross_rpm: "GROSS/RPM",
  dispatcher: "Dispatcher",
  recruiting: "Recruiting",
  accounting: "Accounting",
  maintenance: "Maintenance",
  trucks: "Trucks",
  other: "Other",
};

export const COMPLAINT_GROUPS: { label: string; types: ComplaintTypeKey[] }[] = [
  { label: "HOS · Gross/RPM · Dispatcher · Recruiting", types: ["hos", "gross_rpm", "dispatcher", "recruiting"] },
  { label: "Accounting · Maintenance · Trucks · Other", types: ["accounting", "maintenance", "trucks", "other"] },
];

export interface DriverComplaint {
  id: string;
  complaint_type: string;
  driver_id: string | null;
  truck_id: string | null;
  subject_text: string;
  content: string;
  is_resolved: boolean;
  resolved_at: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

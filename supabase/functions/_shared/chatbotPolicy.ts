// The model is an intent parser only. Never send database results or file bytes to it.
export const MODEL = "gemini-flash-lite-latest";
export const KINDS = ["driver", "truck", "trailer", "order", "company"] as const;
export type Kind = typeof KINDS[number];
export type Context = { kind: Kind; id: string; label?: string };
export const isUuid = (v: unknown): v is string => typeof v === "string" && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(v);
export const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind);
export const normalize = (v: string) => v.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_-]+/g, " ");

export const RECORDS = {
  driver: { table: "drivers", identity: "name", fields: ["name", "first_name", "last_name", "phone", "email", "cdl_number", "cdl_expiration_date", "medical_card_expiration_date", "home_address", "home_city", "home_state", "is_active", "hire_date", "company_name", "mc_number", "hazmat", "tanker", "twic"] },
  truck: { table: "trucks", identity: "truck_number", fields: ["truck_number", "vin", "plate", "make", "model", "year", "is_active", "is_temporary_inactive", "dot_inspection_date", "plate_expiration_date", "registration_expiration_date", "insurance_expiration_date", "miles", "miles_updated_at", "last_oil_change_miles", "oil_change_date", "maintenance_check_date", "air_filter", "oos", "pretrip_date"] },
  trailer: { table: "trailers", identity: "trailer_number", fields: ["trailer_number", "vin", "plate", "make", "model", "year", "trailer_type", "is_active", "is_temporary_inactive", "dot_inspection_date", "plate_expiration_date", "insurance_expiration_date", "vented"] },
  order: { table: "orders", identity: "internal_load_number", fields: ["internal_load_number", "load_number", "broker_load_number", "status", "pickup_datetime", "delivery_datetime", "commodity", "weight", "mileage", "loaded_miles", "dh_miles", "pu_number", "po_number", "reference_number", "canceled"] },
  company: { table: "companies", identity: "name", fields: ["name"] },
} as const;
export const MONEY_FIELDS = ["freight_amount", "driver_price"] as const;
export const FILES = {
  driver: { table: "driver_files", owner: "driver_id", bucket: "driver-files", page: "/drivers", tab: "Driver Files" },
  truck: { table: "truck_files", owner: "truck_id", bucket: "truck-files", page: "/trucks", tab: "Truck Files" },
  trailer: { table: "trailer_files", owner: "trailer_id", bucket: "trailer-files", page: "/trailers", tab: "Trailer Files" },
  order: { table: "order_files", owner: "order_id", bucket: "order-files", page: "/edit-order", tab: "Files" },
  company: { table: "company_files", owner: "company_id", bucket: "company-files", page: "/info", tab: "Company Info" },
} as const;

// Defense in depth; authorization depends on the finite tools/fields, not a keyword filter.
export function restrictedRequest(message: string) {
  return /\b(salar\w*|payroll|pay\s*stub|statement|gross|cut|profit|commission|performance|ranking|leaderboard|bank\w*|routing|iban|swift|password\w*|credential\w*|api\s*key|secret\w*|internal\s*note\w*|comment\w*|napomen\w*|komentar\w*|plat[aeu]|zarad\w*|ucina\w*|lozink\w*|sifr\w*)\b/i.test(normalize(message));
}
export function aggregateRequest(message: string) {
  return /\b(total\w*|sum|average|avg|combined|aggregate|highest|lowest|top\s*\d*|rank\w*|all\s+loads|each\s+load|every\s+load|ukup\w*|zbir\w*|prosek|prosec\w*|sve\s+ture|svih\s+tura)\b/i.test(normalize(message));
}
const blockedFile = /\b(salar\w*|payroll|payslip|pay\s*stub|statement|settlement|bank\w*|routing|deposit|void\w*\s*check|w\s*9|1099|password\w*|credential\w*|secret\w*|api\s*key|internal\s*note\w*|comment\w*|performance|plat[aeu]|zarad\w*|napomen\w*|komentar\w*)\b/i;
const safeTypes = new Set(["cdl", "cdl_front", "cdl_back", "ssn", "medical_card", "ccf", "pre_emp_drug_test", "fmcsa_national_registry", "psp_consent", "psp", "mvr_consent", "mvr", "clearinghouse_consent", "clearinghouse", "drug_alcohol_consent", "driver_consent", "legal_authorization", "safe_policy", "rules", "arbitrate", "annual_dot", "dot", "registration", "registration_affirmation", "ky_permit", "ny_permit", "nm_permit", "ifta_licence", "insurance", "coi", "RC", "BOL", "POD"]);
export type FileMeta = { id: string; file_name: string; file_path: string; folder?: string | null; keywords?: string[] | null; file_category?: string | null; created_at?: string; storageBucket?: string; storageOwner?: string };
export function fileAllowed(file: FileMeta, review?: boolean) {
  const text = normalize([file.file_name, file.folder, ...(file.keywords || []), file.file_category].filter(Boolean).join(" "));
  if (blockedFile.test(text) || review === false) return false;
  // Ambiguous/mixed files (applications, agreements, generic scans) need explicit admin review.
  if (review === true) return true;
  return (file.keywords || []).some(k => safeTypes.has(k)) || safeTypes.has(file.file_category || "");
}
export function validStoragePath(file: FileMeta, ownerId: string) {
  return !file.file_path.includes("..") && !file.file_path.includes(":") && file.file_path.startsWith(`${ownerId}/`);
}
export function fileMatches(file: FileMeta, query: string) {
  if (!query || query === "all") return true;
  const text = normalize([file.file_name, ...(file.keywords || []), file.file_category || ""].join(" "));
  const q = normalize(query);
  if (/cab\s*card|registration|irp/.test(q)) return /registration|cab\s*card|\birp\b/.test(text);
  if (/cdl|license/.test(q)) return /cdl|license/.test(text) && (!q.includes("front") || /front/.test(text)) && (!q.includes("back") || /back/.test(text));
  if (/insurance|certificate of insurance|\bcoi\b/.test(q)) return /insurance|\bcoi\b/.test(text);
  return q.split(/\s+/).every(word => text.includes(word));
}
export function recordLink(kind: Kind, id: string, files = false) {
  if (kind === "order") return `/edit-order/${id}${files ? "?tab=files" : ""}`;
  if (kind === "company") return "/info";
  return `${FILES[kind].page}?record=${encodeURIComponent(id)}${files ? "&tab=files" : ""}`;
}
export function cleanQuery(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/[^\p{L}\p{N}\s@.'-]/gu, "").slice(0, 100) : "";
}
export const EN = {
  found: "Here are the saved details.", missing: "Not saved", notFound: "No matching record found.",
  choose: "Select a record.", specify: "Which driver, truck, trailer, company, or load?", blocked: "This information is unavailable in the chatbot.",
  files: "Files", noFiles: "No matching approved files found.", manual: "Find it manually", open: "Open in TMS", download: "Download", view: "Open file", more: "More files", older: "Newest first; check the document's validity.",
  help: "Ask for a yard/company address, driver or vehicle details, documents, or one load's details.",
  steps: "Open the page → search for the record → open it", filesStep: "Select the files tab and document type", faqMissing: "No matching FAQ answer found.",
  yes: "Yes", no: "No", expired: "Expired", current: "Current record", clear: "Clear chat", send: "Send", placeholder: "Ask about a driver, vehicle, load, or document…",
};
export type Ui = typeof EN;
export type Intent = { task: "record" | "files" | "company" | "faq" | "help" | "blocked"; kind: Kind; query: string; document: string; fields: string[]; financial: boolean; language: string; ui: Ui; fieldLabels: Record<string, string> };
export function validateIntent(raw: unknown): Intent {
  if (!raw || typeof raw !== "object") throw new Error("Invalid intent");
  const v = raw as Record<string, unknown>;
  if (!["record", "files", "company", "faq", "help", "blocked"].includes(String(v.task)) || !isKind(v.kind)) throw new Error("Invalid intent");
  const kind = v.kind;
  const fields = Array.isArray(v.fields) ? v.fields.filter((x): x is string => typeof x === "string" && [...RECORDS[kind].fields, ...MONEY_FIELDS].includes(x as never)).slice(0, 8) : [];
  const ui = { ...EN };
  for (const key of Object.keys(EN) as (keyof Ui)[]) {
    const value = (v.ui as Record<string, unknown> | undefined)?.[key];
    // Model-generated text is used only for generic localization, never facts/amounts/URLs.
    if (typeof value === "string" && value.length > 0 && value.length <= 240 && !/[\d<>$]|https?:|\{\{/i.test(value)) ui[key] = value;
  }
  const fieldLabels: Record<string, string> = {};
  for (const field of [...RECORDS[v.kind].fields, ...MONEY_FIELDS]) {
    const label = (v.fieldLabels as Record<string, unknown> | undefined)?.[field];
    if (typeof label === "string" && label.length < 80 && !/[\d<>$]|https?:/i.test(label)) fieldLabels[field] = label;
  }
  return { task: v.task as Intent["task"], kind: v.kind, query: cleanQuery(v.query), document: cleanQuery(v.document).toLowerCase(), fields, financial: v.financial === true && v.kind === "order", language: String(v.language || "en").slice(0, 12), ui, fieldLabels };
}

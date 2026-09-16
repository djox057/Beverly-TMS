export const STATUSES = ["New", "Contacted", "Scheduled", "Arrived", "Canceled"] as const;
export type CandidateStatus = typeof STATUSES[number];
export interface CandidateFields {
  recruiter_id: string | null; driver_name: string; phone: string;
  safety_id: string | null; dispatcher_id: string | null; company_id: string | null;
  sales: string; timing_note: string; application_status: string;
  transport_note: string; description: string; mvr: string; psp: string;
  preference: string; truck_id: string | null; truck_terms: string;
  drug_test_company: string; clearinghouse_status: string;
  status: CandidateStatus; ticket_note: string;
  q_class_a_experience: string; q_current_company_tenure: string; q_company_changes: string;
  q_leaving_reason: string; q_avg_weekly_miles: string; q_driving_type: string;
  q_sap_refusal: string; q_accidents: string; q_trailer_types: string; q_freight_types: string;
  q_truck_models: string; q_transmission: string; q_preferred_models: string;
  q_truck_age_preference: string; q_max_weekly_miles: string; q_miles_comfort: string;
  q_home_time: string; q_home_day: string;
  arrival_date: string | null; arrival_time: string | null; tentative: boolean;
  row_color: RowColor;
}
export const ROW_COLORS = ["blue","yellow","green"] as const;
export type RowColor = typeof ROW_COLORS[number] | null;
export interface Candidate extends CandidateFields {
  id: string; archived: boolean; version: number;
  created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
  transport_preview: string; description_preview: string; mvr_preview: string; psp_preview: string; ticket_preview: string;
}
/** Screening answers are loaded on demand, so the board summary omits them. */
export type ScreeningField = Extract<keyof CandidateFields, `q_${string}`>;
export type CandidateSummary = Omit<Candidate, "transport_note" | "description" | "mvr" | "psp" | "ticket_note" | ScreeningField>;
export interface Staff { user_id: string; full_name: string; role: string }
export interface References { staff: Staff[]; trucks: {id: string; truck_number: string}[]; companies: {id: string; name: string}[] }
export const EMPTY_CANDIDATE: CandidateFields = {
  recruiter_id: null, driver_name: "", phone: "", safety_id: null, dispatcher_id: null, company_id: null,
  sales: "", timing_note: "", application_status: "", transport_note: "", description: "",
  mvr: "", psp: "", preference: "", truck_id: null, truck_terms: "", drug_test_company: "",
  clearinghouse_status: "", status: "New", ticket_note: "",
  q_class_a_experience: "", q_current_company_tenure: "", q_company_changes: "", q_leaving_reason: "",
  q_avg_weekly_miles: "", q_driving_type: "", q_sap_refusal: "", q_accidents: "", q_trailer_types: "",
  q_freight_types: "", q_truck_models: "", q_transmission: "", q_preferred_models: "",
  q_truck_age_preference: "", q_max_weekly_miles: "", q_miles_comfort: "", q_home_time: "", q_home_day: "", arrival_date: null, arrival_time: null, tentative: false,
  row_color: null,
};
export const SUMMARY_FIELDS = "id,recruiter_id,driver_name,phone,safety_id,dispatcher_id,company_id,sales,timing_note,application_status,transport_preview,description_preview,mvr_preview,psp_preview,preference,truck_id,truck_terms,drug_test_company,clearinghouse_status,status,ticket_preview,arrival_date,arrival_time,tentative,row_color,archived,version,created_at,updated_at,created_by,updated_by";
export const FIELD_LABELS: Record<keyof CandidateFields, string> = {
  recruiter_id: "Recruiter", driver_name: "Driver", phone: "Phone", safety_id: "Safety", dispatcher_id: "Dispatcher",
  company_id: "Company",
  sales: "Sales", timing_note: "Time", application_status: "APP", transport_note: "Uber / Transport notes",
  description: "Description / Comments", mvr: "Driver’s MVR", psp: "Driver’s PSP", preference: "Preference",
  truck_id: "Truck", truck_terms: "Truck price / terms", drug_test_company: "Drug test company",
  clearinghouse_status: "CH", status: "Status", ticket_note: "Ticket", arrival_date: "Arrival date (Chicago)",
  arrival_time: "Arrival time (Chicago)", tentative: "50/50 — tentative", row_color: "Color",
  q_class_a_experience: "Active Class A experience in the last 2 years?",
  q_current_company_tenure: "How long with the current / most recent company?",
  q_company_changes: "How many companies changed in the career (or last 2–3 years)?",
  q_leaving_reason: "Major reason for leaving?",
  q_avg_weekly_miles: "Average mileage per week?",
  q_driving_type: "Type of driving in the last 2 years (Local / Regional / OTR — which area)?",
  q_sap_refusal: "Ever on a SAP program, or refused an alcohol or drug test?",
  q_accidents: "Any accidents? If yes, explanation",
  q_trailer_types: "What types of trailers pulled?",
  q_freight_types: "What types of loads / freight hauled?",
  q_truck_models: "What truck models driven?",
  q_transmission: "Automatic, manual, or both?",
  q_preferred_models: "Which models preferred?",
  q_truck_age_preference: "Start with a used truck 2023–2025, or something newer 2026–2027?",
  q_max_weekly_miles: "Most miles driven in one week?",
  q_miles_comfort: "Comfortable running 2,500–3,000 miles per week?",
  q_home_time: "Weekly home time, bi-weekly, or longer OTR periods?",
  q_home_day: "Any specific day needed at home?",
};

/** Screening answers, in the order recruiters ask them. */
export const SCREENING_FIELDS: (keyof CandidateFields)[] = [
  "q_class_a_experience","q_current_company_tenure","q_company_changes","q_leaving_reason",
  "q_avg_weekly_miles","q_driving_type","q_sap_refusal","q_accidents","q_trailer_types",
  "q_freight_types","q_truck_models","q_transmission","q_preferred_models","q_truck_age_preference",
  "q_max_weekly_miles","q_miles_comfort","q_home_time","q_home_day",
];

/** The answers that decide whether a candidate can be hired at all. */
export const SCREENING_KEY_FIELDS: (keyof CandidateFields)[] = [
  "q_class_a_experience","q_current_company_tenure","q_company_changes","q_leaving_reason",
  "q_sap_refusal","q_accidents","q_avg_weekly_miles","q_driving_type",
];
export function nextRowColor(current: RowColor): RowColor {
  const index = ROW_COLORS.indexOf(current as typeof ROW_COLORS[number]);
  return index === ROW_COLORS.length - 1 ? null : ROW_COLORS[index + 1];
}
// Colors carry the schedule state: blue/yellow stay in Upcoming, green means Arrived.
export const COLOR_STATUS: Record<Exclude<RowColor, null>, CandidateStatus> = {
  blue: "Scheduled", yellow: "Contacted", green: "Arrived",
};
export function rowColorForStatus(status: CandidateStatus): RowColor {
  if (status === "Arrived") return "green";
  if (status === "Scheduled") return "blue";
  if (status === "Contacted") return "yellow";
  return null;
}
// Board columns: everything else lives in the expanded row details.
export const COLUMNS: {field: keyof CandidateFields; letter: string; width: number; preview?: keyof CandidateSummary; label?: string}[] = [
  {field:"recruiter_id",letter:"",width:90},{field:"driver_name",letter:"",width:130},
  {field:"arrival_time",letter:"",width:95,label:"Time"},
  {field:"phone",letter:"",width:165},{field:"transport_note",letter:"",width:170,preview:"transport_preview"},
  {field:"description",letter:"",width:210,preview:"description_preview"},
  {field:"company_id",letter:"",width:110},{field:"truck_id",letter:"",width:150},

  {field:"mvr",letter:"",width:130,preview:"mvr_preview"},{field:"psp",letter:"",width:130,preview:"psp_preview"},
  {field:"clearinghouse_status",letter:"",width:85},
];

/** Short display name for a company: "BF Prime LLC" -> "BF Prime". */
export function shortCompanyName(name: string): string {
  return name.replace(/[,]?\s*\b(l\.?l\.?c\.?|inc\.?|corp\.?|co\.?|ltd\.?)\s*$/i, "").trim() || name;
}
/** Staff nickname: "Andjela Obradovic-Ashley" -> "Ashley". */
export function shortStaffName(name: string): string {
  const parts = name.split("-");
  return (parts.length > 1 ? parts[parts.length-1] : name).trim() || name;
}


// Only the live clock uses Chicago. Entered dates are calendar keys, never instants.
export function chicagoToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function calendarDate(key: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("Invalid calendar date");
  const [y,m,d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y,m-1,d));
  if (date.toISOString().slice(0,10) !== key) throw new Error("Invalid calendar date");
  return date;
}
export function addDays(key: string, days: number): string {
  const date = calendarDate(key); date.setUTCDate(date.getUTCDate()+days);
  return date.toISOString().slice(0,10);
}
export function mondayOf(key: string): string { return addDays(key, -(calendarDate(key).getUTCDay()+6)%7); }
export function dayLabel(key: string): string {
  const d=calendarDate(key);
  return `${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getUTCDay()]}, ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getUTCMonth()]} ${d.getUTCDate()}`;
}
export function clockLabel(time: string | null): string {
  if (!time) return "";
  const [h,m] = time.split(":"); const hour=Number(h);
  return `${hour%12 || 12}:${m} ${hour<12?"AM":"PM"}`;
}
export function formatPhone(phone: string): string {
  const digits=phone.replace(/\D/g,"");
  const national=digits.length===11 && digits.startsWith("1")?digits.slice(1):digits;
  if(national.length!==10) return phone;
  return `${digits.length===11?"+1 ":""}(${national.slice(0,3)}) ${national.slice(3,6)}-${national.slice(6)}`;
}
export function inBoard(row: CandidateSummary, week: string, archived: boolean): boolean {
  return row.archived===archived && (!row.arrival_date || (row.arrival_date>=week && row.arrival_date<=addDays(week,6)));
}
export function reconcileRows(current: CandidateSummary[], changed: CandidateSummary[], ids: string[], week: string, archived: boolean): CandidateSummary[] {
  const map = new Map(current.map(r=>[r.id,r]));
  const found = new Set(changed.map(r=>r.id));
  for (const id of ids) if(!found.has(id)) map.delete(id);
  for (const row of changed) {
    const old=map.get(row.id);
    if(old && old.version>row.version) continue;
    if(inBoard(row,week,archived)) map.set(row.id,row); else map.delete(row.id);
  }
  return [...map.values()];
}
export function changedFields(original: CandidateFields, draft: CandidateFields): Partial<CandidateFields> {
  return Object.fromEntries((Object.keys(EMPTY_CANDIDATE) as (keyof CandidateFields)[])
    .filter(k=>original[k]!==draft[k]).map(k=>[k,draft[k]]));
}
export function validateCandidate(draft: CandidateFields): string | null {
  if(!draft.driver_name.trim()) return "Enter the driver’s name.";
  if(!/^\d{7,15}$/.test(draft.phone.replace(/\D/g,""))) return "Enter a valid phone number (7–15 digits).";
  if(draft.arrival_date) { try { calendarDate(draft.arrival_date); } catch { return "Choose a valid arrival date."; } }
  if(draft.arrival_time && !draft.arrival_date) return "Choose an arrival date before entering a time.";
  return null;
}

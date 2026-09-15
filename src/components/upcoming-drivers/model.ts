export const STATUSES = ["New", "Contacted", "Scheduled", "Arrived", "Canceled"] as const;
export type CandidateStatus = typeof STATUSES[number];
export interface CandidateFields {
  recruiter_id: string | null; driver_name: string; phone: string;
  safety_id: string | null; dispatcher_id: string | null;
  sales: string; timing_note: string; application_status: string;
  transport_note: string; description: string; mvr: string; psp: string;
  preference: string; truck_id: string | null; truck_terms: string;
  drug_test_company: string; clearinghouse_status: string;
  status: CandidateStatus; ticket_note: string;
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
export type CandidateSummary = Omit<Candidate, "transport_note" | "description" | "mvr" | "psp" | "ticket_note">;
export interface Staff { user_id: string; full_name: string; role: string }
export interface References { staff: Staff[]; trucks: {id: string; truck_number: string}[]; companies: {id: string; name: string}[] }
export const EMPTY_CANDIDATE: CandidateFields = {
  recruiter_id: null, driver_name: "", phone: "", safety_id: null, dispatcher_id: null,
  sales: "", timing_note: "", application_status: "", transport_note: "", description: "",
  mvr: "", psp: "", preference: "", truck_id: null, truck_terms: "", drug_test_company: "",
  clearinghouse_status: "", status: "New", ticket_note: "", arrival_date: null, arrival_time: null, tentative: false,
  row_color: null,
};
export const SUMMARY_FIELDS = "id,recruiter_id,driver_name,phone,safety_id,dispatcher_id,sales,timing_note,application_status,transport_preview,description_preview,mvr_preview,psp_preview,preference,truck_id,truck_terms,drug_test_company,clearinghouse_status,status,ticket_preview,arrival_date,arrival_time,tentative,row_color,archived,version,created_at,updated_at,created_by,updated_by";
export const FIELD_LABELS: Record<keyof CandidateFields, string> = {
  recruiter_id: "Recruiter", driver_name: "Driver", phone: "Phone", safety_id: "Safety", dispatcher_id: "Dispatcher",
  sales: "Sales", timing_note: "Time", application_status: "APP", transport_note: "Uber / Transport notes",
  description: "Description / Comments", mvr: "Driver’s MVR", psp: "Driver’s PSP", preference: "Preference",
  truck_id: "Truck", truck_terms: "Truck price / terms", drug_test_company: "Drug test company",
  clearinghouse_status: "CH", status: "Status", ticket_note: "Ticket", arrival_date: "Arrival date (Chicago)",
  arrival_time: "Arrival time (Chicago)", tentative: "50/50 — tentative", row_color: "Color",
};
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
export const COLUMNS: {field: keyof CandidateFields; letter: string; width: number; preview?: keyof CandidateSummary}[] = [
  {field:"recruiter_id",letter:"A",width:130},{field:"driver_name",letter:"B",width:190},
  {field:"phone",letter:"C",width:175},{field:"safety_id",letter:"D",width:125},
  {field:"dispatcher_id",letter:"E",width:125},{field:"sales",letter:"F",width:100},
  {field:"timing_note",letter:"G",width:130},{field:"application_status",letter:"H",width:80},
  {field:"transport_note",letter:"I",width:155,preview:"transport_preview"},
  {field:"description",letter:"J",width:200,preview:"description_preview"},
  {field:"mvr",letter:"K",width:135,preview:"mvr_preview"},{field:"psp",letter:"L",width:135,preview:"psp_preview"},
  {field:"preference",letter:"M",width:135},{field:"truck_id",letter:"N",width:150},
  {field:"drug_test_company",letter:"O",width:150},{field:"clearinghouse_status",letter:"P",width:85},
  {field:"status",letter:"Q",width:110},{field:"ticket_note",letter:"R",width:180,preview:"ticket_preview"},
];

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

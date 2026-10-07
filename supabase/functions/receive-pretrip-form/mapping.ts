export const PHOTO_CATEGORIES = [
  ["Truck front headlights and turn signals", "Upload picture of Truck Front Headlights and Turn Signals"],
  ["Steering axle tires", "Upload picture of Steering Axle Tires"],
  ["Truck drive axle 1 tires", "Upload picture of Truck Drive Axle 1 Tires"],
  ["Truck drive axle 2 tires", "Upload picture of Truck Drive Axle 2 Tires"],
  ["Trailer axle 1 tires", "Upload picture of Trailer Axle 1 Tires"],
  ["Trailer axle 2 tires", "Upload picture of Trailer Axle 2 Tires"],
  ["Truck DOT sticker", "Upload picture of Truck DOT Sticker"],
  ["Trailer DOT sticker", "Upload picture of Trailer DOT Sticker"],
] as const;
export const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
export const unitKey = (s: string) => s.trim().replace(/^#\s*/, "").toUpperCase();
export function sheetDate(value: unknown): string {
  let text: string;
  if (typeof value === "number" && Number.isFinite(value)) {
    text = new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000).toISOString().slice(0,10);
  } else {
    text=String(value??"").trim();
    const m=text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) text=`${m[3]}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text+"T00:00:00Z").toISOString().slice(0,10)!==text) throw new Error("Invalid inspection date");
  return text;
}
export function sheetTimestamp(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(Date.UTC(1899,11,30)+Math.round(value*86400000)).toISOString().replace(/Z$/, "");
  return String(value??"").trim();
}
export function fileIds(value: string): string[] {
  const ids=[...value.matchAll(/(?:[?&]id=|\/d\/)([a-zA-Z0-9_-]{10,})/g)].map(m=>m[1]);
  return [...new Set(ids)];
}
export type FormFile = { category: string; drive_id: string; status: "pending" | "imported" | "error"; file_path?: string; file_name?: string; error?: string };
export function mapResponse(headers: string[], row: unknown[]) {
  const answers: Record<string,string>={};
  headers.forEach((h,i)=> { if (h.trim()) answers[h]=String(row[i]??""); });
  const get=(name: string, aliases: string[] = [])=> {
    const matches=headers.map((h,i)=>({h,i})).filter(x=>[name, ...aliases].some(label => normalize(x.h)===normalize(label)));
    if(matches.length!==1) throw new Error(`Missing or ambiguous column: ${name}`);
    return row[matches[0].i];
  };
  const files: FormFile[]=[];
  for(const [category,prefix] of PHOTO_CATEGORIES) {
    const index=headers.findIndex(h=>normalize(h).startsWith(normalize(prefix)));
    if(index<0) throw new Error(`Missing photo column: ${category}`);
    const raw=String(row[index]??"");
    const ids=fileIds(raw);
    if(raw.trim() && !ids.length) throw new Error(`Invalid photo link: ${category}`);
    for(const drive_id of ids) files.push({category,drive_id,status:"pending"});
  }
  const truck_number=String(get("Truck Number")??"").trim();
  const driver_name=String(get("Driver Full Name", ["Driver name and last name"])??"").trim();
  if(!truck_number || !driver_name) throw new Error("Truck number and driver name are required");
  const emailIndex=headers.findIndex(h=>["email", "email address"].includes(normalize(h)));
  const timestampIndex=headers.findIndex(h=>normalize(h)==="timestamp");
  return {driver_name,truck_number,trailer_number:String(get("Trailer Number")??""),inspection_date:sheetDate(headers.some(h => normalize(h) === "inspection date") ? get("Inspection Date") : sheetTimestamp(row[timestampIndex]).split("T")[0]),
    email: emailIndex>=0?String(row[emailIndex]??""):"",submitted_at:sheetTimestamp(row[timestampIndex]),
    complaints:String(get("Driver Complaints or Maintenance Issues")??""),answers,files};
}
export function matchTruck(number: string, trucks: {id:string;truck_number:string}[]): string|null {
  const matches=trucks.filter(t=>unitKey(t.truck_number)===unitKey(number));
  return matches.length===1?matches[0].id:null;
}

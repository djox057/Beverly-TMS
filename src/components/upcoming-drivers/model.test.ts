import { describe, expect, it } from "vitest";
import { addDays, calendarDate, changedFields, chicagoToday, clockLabel, EMPTY_CANDIDATE, mondayOf, reconcileRows, validateCandidate, type CandidateSummary } from "./model";
const row=(id:string,date:string|null,version=1,archived=false):CandidateSummary=>({...EMPTY_CANDIDATE,id,arrival_date:date,version,archived,
  created_at:"2026-09-15T12:00:00Z",updated_at:"2026-09-15T12:00:00Z",created_by:null,updated_by:null,
  transport_preview:"",description_preview:"",mvr_preview:"",psp_preview:"",ticket_preview:""});

describe("Chicago calendar scheduling",()=>{
  it("uses Chicago's current day across UTC midnight and DST",()=>{
    expect(chicagoToday(new Date("2026-09-16T02:00:00Z"))).toBe("2026-09-15");
    expect(chicagoToday(new Date("2026-03-08T07:59:00Z"))).toBe("2026-03-08");
    expect(chicagoToday(new Date("2026-03-08T08:01:00Z"))).toBe("2026-03-08");
  });
  it("keeps entered calendar dates fixed across DST and year boundaries",()=>{
    expect(mondayOf("2026-03-08")).toBe("2026-03-02");
    expect(addDays("2026-03-02",7)).toBe("2026-03-09");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(addDays("2026-10-26",7)).toBe("2026-11-02");
    expect(addDays("2028-02-28",1)).toBe("2028-02-29");
  });
  it("never converts entered arrival times",()=>{
    expect(clockLabel("01:30:00")).toBe("1:30 AM");
    expect(clockLabel("23:45")).toBe("11:45 PM");
    expect(clockLabel("00:00")).toBe("12:00 AM");
    expect(clockLabel(null)).toBe("");
  });
  it("rejects impossible dates instead of shifting them",()=>{
    expect(()=>calendarDate("2026-02-30")).toThrow();
    expect(()=>calendarDate("2026-13-01")).toThrow();
  });
});
describe("Incremental board updates",()=>{
  it("moves records across weeks and into/out of Unscheduled",()=>{
    const current=[row("a","2026-09-15"),row("b",null)];
    const result=reconcileRows(current,[row("a","2026-09-22",2),row("b","2026-09-16",2),row("c",null)], ["a","b","c"],"2026-09-14",false);
    expect(result.map(r=>r.id).sort()).toEqual(["b","c"]);
    expect(result.find(r=>r.id==="b")?.arrival_date).toBe("2026-09-16");
  });
  it("removes archived/missing records and ignores older versions",()=>{
    const current=[row("a","2026-09-15",3),row("b",null),row("c",null)];
    const result=reconcileRows(current,[row("a",null,2),row("b",null,2,true)],["a","b","c"],"2026-09-14",false);
    expect(result).toEqual([current[0]]);
  });
  it("only patches fields actually edited",()=>{
    expect(changedFields(EMPTY_CANDIDATE,{...EMPTY_CANDIDATE,description:"New full comment"})).toEqual({description:"New full comment"});
  });
  it("requires a new driver's name and phone, and a date for a time",()=>{
    expect(validateCandidate(EMPTY_CANDIDATE)).toMatch(/name/);
    expect(validateCandidate({...EMPTY_CANDIDATE,driver_name:"Test"})).toMatch(/phone/);
    expect(validateCandidate({...EMPTY_CANDIDATE,driver_name:"Test",phone:"312-555-0123",arrival_time:"14:30"})).toMatch(/arrival date/);
    expect(validateCandidate({...EMPTY_CANDIDATE,driver_name:"Test",phone:"312-555-0123",arrival_date:"2026-09-15",arrival_time:"14:30"})).toBeNull();
  });
});

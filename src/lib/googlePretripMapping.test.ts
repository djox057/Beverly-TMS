import { describe, expect, it } from "vitest";
import { PHOTO_CATEGORIES, fileIds, mapResponse, matchTruck, sheetDate, sheetTimestamp } from "../../supabase/functions/receive-pretrip-form/mapping";
const headers=["Timestamp","Email Address","Driver Full Name","Inspection Date","Truck Number","Trailer Number",...PHOTO_CATEGORIES.map(([,h])=>h.includes("DOT")?h+" (Note: This is only required once per period and not necessarily every daily trip)":h),"Driver Complaints or Maintenance Issues","Additional check"];
const row=[46200.5,"driver@example.com","John Doe","10/05/2026","#2405","T123",...PHOTO_CATEGORIES.map(()=>"https://drive.google.com/open?id=abcdefghijk12345"),"Tire is low","Yes"];
describe("Google pre-trip response mapping",()=>{
 it("maps every field, DOT suffixes, extra answers, and eight upload categories",()=>{
  const result=mapResponse(headers,row);
  expect(result).toMatchObject({inspection_date:"2026-10-05",email:"driver@example.com",driver_name:"John Doe",truck_number:"#2405",trailer_number:"T123",complaints:"Tire is low"});
  expect(result.files).toHaveLength(8);expect(result.answers["Additional check"]).toBe("Yes");
  expect(result.files[7].category).toBe("Trailer DOT sticker");
 });
 it("supports several photos per question and deduplicates repeated URLs",()=>{
  expect(fileIds("https://drive.google.com/open?id=abcdefghijk12345, https://drive.google.com/file/d/otherfile12345/view, https://drive.google.com/open?id=abcdefghijk12345")).toEqual(["abcdefghijk12345","otherfile12345"]);
 });
 it("accepts serial and ISO dates without shifting calendar days",()=>{
  expect(sheetDate(46200.99)).toBe("2026-06-27");
  expect(sheetDate("2026-10-05")).toBe("2026-10-05");
  expect(sheetTimestamp(46200.5)).toBe("2026-06-27T12:00:00.000");
  expect(()=>sheetDate("02/30/2026")).toThrow();expect(()=>sheetDate("")).toThrow();
 });
 it("rejects renamed essential fields and malformed upload URLs",()=>{
  expect(()=>mapResponse(headers.map(h=>h==="Truck Number"?"Unit":h),row)).toThrow("Truck Number");
  const bad=[...row];bad[6]="https://example.com/secret.jpg";
  expect(()=>mapResponse(headers,bad)).toThrow("Invalid photo link");
 });
 it("matches exact unique unit numbers and quarantines ambiguous or missing trucks",()=>{
  expect(matchTruck(" #2405 ",[{id:"one",truck_number:"2405"}])).toBe("one");
  expect(matchTruck("2405",[{id:"one",truck_number:"2405"},{id:"two",truck_number:"2405"}])).toBeNull();
  expect(matchTruck("2405",[{id:"one",truck_number:"02405"}])).toBeNull();
 });
});

it("accepts the current response sheet labels and uses the submission date when no inspection date is asked",()=>{
 const currentHeaders=["Timestamp","Driver name and last name","Truck number","Trailer number",...PHOTO_CATEGORIES.map(([,prefix])=>prefix),"Driver Complaints or Maintenance Issues","Email Address"];
 const result=mapResponse(currentHeaders,["2026-10-07T08:43:56","Example Driver","4662","T123",...PHOTO_CATEGORIES.map(()=>"https://drive.google.com/open?id=abcdefghijk12345"),"No issues","driver@example.com"]);
 expect(result.inspection_date).toBe("2026-10-07");expect(result.driver_name).toBe("Example Driver");expect(result.files).toHaveLength(8);
});

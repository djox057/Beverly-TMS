import { expect,it } from "vitest";
import { latestDailyPretripSubmissions } from "./pretripSubmissions";

it("shows the latest same-day form even when identical photos are reordered",()=>{
 const old={id:"old",truck_id:"3528",inspection_date:"2026-10-12",submitted_at:"2026-10-12T08:15:17.979",files:["one","two"]};
 const latest={...old,id:"latest",submitted_at:"2026-10-12T08:23:02.784",files:["two","one"]};
 expect(latestDailyPretripSubmissions([old,latest])).toEqual([latest]);
 expect(latestDailyPretripSubmissions([latest,old])).toEqual([latest]);
});
it("keeps different days and units separate",()=>{
 const forms=[
  {id:"a",truck_id:"1",inspection_date:"2026-10-12",submitted_at:"2026-10-12T08:00:00"},
  {id:"b",truck_id:"1",inspection_date:"2026-10-13",submitted_at:"2026-10-13T08:00:00"},
  {id:"c",truck_id:"2",inspection_date:"2026-10-12",submitted_at:"2026-10-12T08:00:00"},
 ];
 expect(latestDailyPretripSubmissions(forms)).toEqual(forms);
});
it("does not fall back to an older successful form when the latest is incomplete",()=>{
 const older={id:"older",truck_id:"1",submitted_at:"2026-10-12T08:00:00",status:"imported"};
 const newer={...older,id:"newer",submitted_at:"2026-10-12T09:00:00",status:"pending"};
 expect(latestDailyPretripSubmissions([older,newer])).toEqual([newer]);
});
it("uses the later source row to resolve identical submission timestamps",()=>{
 const old={id:"a",truck_id:"1",submitted_at:"2026-10-12T08:00:00",source_row:2};
 const latest={...old,id:"b",source_row:3};
 expect(latestDailyPretripSubmissions([latest,old])).toEqual([latest]);
});

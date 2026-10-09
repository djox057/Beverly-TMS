import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { pretripWeekStart, pretripWeekEnd } from "@/lib/pretripDates";
import { PHOTO_CATEGORIES, normalize } from "../../supabase/functions/receive-pretrip-form/mapping";

export const PRETRIP_FORM_URL="https://docs.google.com/forms/d/e/1FAIpQLSdas-2jAuWm6_ihsVgpayT_pPACcO_CdBCjzHyBsJmdZJ38hg/viewform";
const ACTIVE_PRETRIP_SHEET_ID="1XhvVxfi2g_cYQUJfZiAgBORbl8ciqwKFkTebBlVunBQ";
type FormFile={category:string;drive_id:string;status:string;file_path?:string;file_name?:string;error?:string};
export type PretripSubmission={id:string;truck_id:string|null;truck_number:string;trailer_number:string;driver_name:string;email:string;inspection_date:string|null;submitted_at:string;source_timezone:string;answers:Record<string,string>;complaints:string;files:FormFile[];status:string;import_error:string|null};
function formChoiceLabel(submission: PretripSubmission, index: number) {
 const parts=submission.submitted_at.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
 if(!parts) return `Form ${index+1} · ${submission.driver_name || "Unknown driver"} · ${submission.submitted_at || "time unavailable"}`;
 const [,year,month,day,hourText,minute]=parts;
 const date=new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(Number(year),Number(month)-1,Number(day))));
 const hour=Number(hourText);
 const time=`${hour%12||12}:${minute} ${hour<12?"AM":"PM"}`;
 return `Form ${index+1} · ${date} · ${time} · ${submission.driver_name || "Unknown driver"}`;
}

export function usePretripSubmissions(date:string) {
 return useQuery({queryKey:["pretrip-form-submissions",pretripWeekStart(date)],refetchInterval:30000,queryFn:async()=>{
  const {data,error}=await (supabase as any).from("pretrip_form_submissions").select("*").eq("sheet_id",ACTIVE_PRETRIP_SHEET_ID).gte("inspection_date",pretripWeekStart(date)).lte("inspection_date",pretripWeekEnd(date)).neq("status","superseded").order("submitted_at",{ascending:false});
  if(error) throw error; return (data??[]) as PretripSubmission[];
 }});
}
function SubmissionDetails({submission:s}:{submission:PretripSubmission}) {
 const [urls,setUrls]=useState<Record<string,string>>({});
 useEffect(()=>{
  let active=true; const paths=s.files.filter(f=>f.file_path).map(f=>f.file_path!);
  if(paths.length) supabase.storage.from("pretrip-photos").createSignedUrls(paths,3600).then(({data})=>{if(active)setUrls(Object.fromEntries((data??[]).filter(x=>x.path&&x.signedUrl).map(x=>[x.path!,x.signedUrl])));});
  return()=>{active=false;};
 },[s.id,s.files]);
 return <div className="space-y-4">
  <dl className="grid grid-cols-2 gap-3 text-sm">
   {[["Driver",s.driver_name],["Email",s.email],["Truck",s.truck_number],["Trailer",s.trailer_number],["Inspection date",s.inspection_date],["Submitted (sheet time)",`${s.submitted_at} (${s.source_timezone})`],["Import status",s.status]].map(([k,v])=><div key={k}><dt className="text-muted-foreground">{k}</dt><dd className="break-words">{v||"—"}</dd></div>)}
  </dl>
  {s.import_error&&<p className="text-sm text-destructive">{s.import_error}</p>}
  <div><h3 className="font-medium">Driver complaints or maintenance issues</h3><p className="whitespace-pre-wrap text-sm">{s.complaints||"—"}</p></div>
  {[...new Set(s.files.map(f=>f.category))].map(category=><section key={category}>
   <h3 className="mb-2 font-medium">{category}</h3>
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{s.files.filter(f=>f.category===category).map(f=><div key={f.drive_id} className="rounded border p-2">
    {f.file_path&&urls[f.file_path]?<a href={urls[f.file_path]} target="_blank" rel="noreferrer"><img src={urls[f.file_path]} alt={category} className="h-32 w-full object-contain"/><p className="truncate text-xs">{f.file_name||"Open photo"}</p></a>:<p className="text-xs text-muted-foreground">{f.error||"Photo import pending"}</p>}
   </div>)}</div>
  </section>)}
  <details><summary className="cursor-pointer text-sm font-medium">All submitted answers</summary><dl className="mt-3 space-y-3">{Object.entries(s.answers).filter(([question]) => !PHOTO_CATEGORIES.some(([, prefix]) => normalize(question).startsWith(normalize(prefix)))).map(([question,answer])=><div key={question}><dt className="text-sm font-medium">{question}</dt><dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{answer||"—"}</dd></div>)}</dl></details>
 </div>;
}
export function PretripFormCell({submissions}:{submissions:PretripSubmission[]}) {
 const [open,setOpen]=useState(false);
 const [selected,setSelected]=useState("");
 const current=submissions.find(s=>s.id===selected)??submissions[0];
 if(!current) return <span className="text-xs text-muted-foreground">No submission</span>;
 return <>
  <Button variant="outline" size="sm" className="h-7 px-2" onClick={()=>setOpen(true)}>Form ({submissions.length})</Button>
  {submissions.some(s=>s.status!=="imported")&&<div className="text-[10px] text-amber-600">Import needs attention</div>}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Pre-trip form — Truck {current.truck_number}</DialogTitle></DialogHeader>
   {submissions.length>1&&<Select value={current.id} onValueChange={setSelected}>
    <SelectTrigger aria-label="Select form submission" className="w-full"><SelectValue placeholder="Choose a form" /></SelectTrigger>
    <SelectContent>{submissions.map((submission,index)=><SelectItem key={submission.id} value={submission.id}>{formChoiceLabel(submission,index)}</SelectItem>)}</SelectContent>
   </Select>}
   <SubmissionDetails submission={current}/>
  </DialogContent></Dialog>
 </>;
}

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import bridgeScript from "../../integrations/google-pretrip/Code.gs?raw";
import { toast } from "@/hooks/use-toast";

export const PRETRIP_FORM_URL="https://docs.google.com/forms/d/e/1FAIpQLSdas-2jAuWm6_ihsVgpayT_pPACcO_CdBCjzHyBsJmdZJ38hg/viewform";
type FormFile={category:string;drive_id:string;status:string;file_path?:string;file_name?:string;error?:string};
export type PretripSubmission={id:string;truck_id:string|null;truck_number:string;trailer_number:string;driver_name:string;email:string;inspection_date:string|null;submitted_at:string;source_timezone:string;answers:Record<string,string>;complaints:string;files:FormFile[];status:string;import_error:string|null};
export function usePretripSubmissions(date:string) {
 return useQuery({queryKey:["pretrip-form-submissions",date],refetchInterval:30000,queryFn:async()=>{
  const {data,error}=await (supabase as any).from("pretrip_form_submissions").select("*").eq("inspection_date",date).neq("status","superseded").order("submitted_at",{ascending:false});
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
  <details><summary className="cursor-pointer text-sm font-medium">All submitted answers</summary><dl className="mt-3 space-y-3">{Object.entries(s.answers).map(([question,answer])=><div key={question}><dt className="text-sm font-medium">{question}</dt><dd className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{answer||"—"}</dd></div>)}</dl></details>
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
   {submissions.length>1&&<select aria-label="Select form submission" className="rounded border bg-background p-2 text-sm" value={current.id} onChange={e=>setSelected(e.target.value)}>{submissions.map(s=><option key={s.id} value={s.id}>{s.submitted_at} — {s.driver_name}</option>)}</select>}
   <SubmissionDetails submission={current}/>
  </DialogContent></Dialog>
 </>;
}
export function PretripFormConnection({canManage}:{canManage:boolean}) {
 const qc=useQueryClient();const [attentionOpen,setAttentionOpen]=useState(false);const [setupOpen,setSetupOpen]=useState(false);const [script,setScript]=useState("");const [generating,setGenerating]=useState(false);
 const {data:state,error}=useQuery({queryKey:["pretrip-form-sync"],refetchInterval:30000,queryFn:async()=>{
  const {data,error}=await (supabase as any).from("pretrip_form_sync").select("*").single();if(error)throw error;return data;
 }});
 const {data:attention=[]}=useQuery({queryKey:["pretrip-form-attention"],refetchInterval:30000,queryFn:async()=>{
  const {data,error}=await (supabase as any).from("pretrip_form_submissions").select("*").in("status",["pending","unmatched","error"]).order("created_at",{ascending:false}).limit(100);if(error)throw error;return (data??[]) as PretripSubmission[];
 }});
 const refresh=()=>{for(const key of ["pretrip-form-sync","pretrip-form-submissions","pretrip-form-attention","pretrip-photos","pretrip-missing-count"])qc.invalidateQueries({queryKey:[key]});};
 const generate=async()=>{setGenerating(true);try{
  const {data,error}=await (supabase as any).rpc("rotate_pretrip_form_token");if(error)throw error;
  setScript(bridgeScript.replace("const TMS_TOKEN = '__TMS_TOKEN__';", "const TMS_TOKEN = '"+data+"';"));
 }catch(e:any){toast({title:"Could not generate connection",description:e.message,variant:"destructive"});}finally{setGenerating(false);}};
 const toggle=async()=>{const {error}=await (supabase as any).from("pretrip_form_sync").update({enabled:!state.enabled}).eq("id",true);if(error)toast({title:"Could not change sync",description:error.message,variant:"destructive"});else refresh();};
 return <div className="space-y-2 rounded-lg border p-3 text-sm">
  <div className="flex flex-wrap items-center gap-3"><a href={PRETRIP_FORM_URL} target="_blank" rel="noreferrer" className="font-medium text-primary underline">Open driver Google Form</a>
   <span className="text-muted-foreground">{state?.enabled?"Google Apps Script connection":state?"Imports paused":"Loading connection…"}{state?.last_success_at?` · Last received submission ${new Date(state.last_success_at).toLocaleString()}`:""}</span>
   {canManage&&<><Button size="sm" variant="outline" onClick={()=>setSetupOpen(true)}>Connect Google Sheet</Button><Button size="sm" variant="ghost" onClick={toggle} disabled={!state}>{state?.enabled?"Pause imports":"Resume imports"}</Button></>}
   {!!attention.length&&<Button size="sm" variant="outline" onClick={()=>setAttentionOpen(true)}>Needs attention ({attention.length}{attention.length===100?"+":""})</Button>}
  </div>
  {error&&<p className="text-destructive">Could not load the Google Form connection.</p>}
  {state?.last_error&&<p className="text-destructive">{state.last_error}</p>}
  <Dialog open={setupOpen} onOpenChange={setSetupOpen}><DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Connect a Google response sheet</DialogTitle></DialogHeader>
   <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Use the form’s Responses tab to link it to a new Google Sheet, or use the existing response sheet.</li><li>Open that sheet’s Extensions → Apps Script.</li><li>Generate and copy the script below, replace the editor contents, and save.</li><li>Run <code>installPretripBridge</code> and authorize the Google permissions as the form owner. New submissions send automatically; failed imports retry every 5 minutes.</li></ol>
   <p className="text-sm text-muted-foreground">The script reads the form’s uploaded photos using your Google account. No service-account sharing is needed. Generating a replacement script disconnects any older connection script. Keep the generated token private.</p>
   <Button onClick={generate} disabled={generating}>{generating?"Generating…":script?"Generate replacement script":"Generate connection script"}</Button>
   {script&&<><textarea aria-label="Google Apps Script connection code" className="h-64 w-full rounded border bg-muted p-2 font-mono text-xs" value={script} readOnly/><Button onClick={async()=>{try{await navigator.clipboard.writeText(script);toast({title:"Script copied"});}catch{toast({title:"Select the script and copy it manually"});}}}>Copy script</Button></>}
  </DialogContent></Dialog>
  <Dialog open={attentionOpen} onOpenChange={setAttentionOpen}><DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto"><DialogHeader><DialogTitle>Form submissions needing attention</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Unknown or ambiguous truck numbers stay here. Correct the truck number in the response sheet; the Google script retries automatically. Photo access failures retry automatically.</p>
   {attention.map(s=><div key={s.id} className="flex items-center justify-between gap-3 border-b py-3"><div><p>{s.inspection_date||"Invalid date"} · Truck {s.truck_number} · {s.driver_name}</p><p className="text-xs text-destructive">{s.import_error||"Import pending"}</p></div><PretripFormCell submissions={[s]}/></div>)}
  </DialogContent></Dialog>
 </div>;
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { candidateKey, fetchCandidate, saveCandidate, useCandidateHistory } from "./useUpcomingDrivers";
import { changedFields, clockLabel, EMPTY_CANDIDATE, FIELD_LABELS, STATUSES, validateCandidate, type Candidate, type CandidateFields, type References } from "./model";

const longFields=["transport_note","description","mvr","psp","ticket_note","preference","truck_terms"];
const nullableFields=["recruiter_id","safety_id","dispatcher_id","truck_id","arrival_date","arrival_time"];
export interface EditorSelection {id:string | null; createId?:string; date?:string | null; field?:keyof CandidateFields}

function FieldInput({field,draft,onChange,refs,disabled}:{field:keyof CandidateFields;draft:CandidateFields;onChange:(value:unknown)=>void;refs:References;disabled:boolean}) {
  const id=`upcoming-${field}`;
  const value=String(draft[field] ?? "");
  const staffRole=({recruiter_id:"recruiting",safety_id:"safety",dispatcher_id:"dispatch"} as Record<string,string>)[field];
  if(staffRole || field==="truck_id") {
    const options=staffRole ? refs.staff.filter(s=>s.role===staffRole).map(s=>({value:s.user_id,label:s.full_name || "Unnamed user"}))
      : refs.trucks.map(t=>({value:t.id,label:t.truck_number}));
    if(value && !options.some(o=>o.value===value)) options.unshift({value,label:"Previously assigned"});
    options.sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
    return <div aria-label={FIELD_LABELS[field]}><Combobox options={options} value={value} disabled={disabled}
      onValueChange={v=>onChange(v || null)} placeholder={`Select ${FIELD_LABELS[field].toLowerCase()}`} modal /></div>;
  }
  if(field==="tentative") return <input id={id} type="checkbox" checked={draft.tentative} onChange={e=>onChange(e.target.checked)} disabled={disabled} className="h-4 w-4" />;
  if(field==="status") return <select id={id} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{STATUSES.map(s=><option key={s}>{s}</option>)}</select>;
  if(longFields.includes(field)) return <Textarea id={id} value={value} readOnly={disabled} onChange={e=>onChange(e.target.value)}
    maxLength={["preference","truck_terms"].includes(field)?2000:20000} rows={field==="description"?8:5} className="resize-y leading-relaxed" />;
  const type=field==="arrival_date"?"date":field==="arrival_time"?"time":field==="phone"?"tel":"text";
  return <>
    <Input id={id} type={type} value={value} readOnly={disabled} min={type==="date"?"2000-01-01":undefined} max={type==="date"?"2100-12-31":undefined}
      maxLength={field==="driver_name"?150:field==="phone"?40:["application_status","clearinghouse_status"].includes(field)?100:field==="drug_test_company"?200:500}
      list={field==="drug_test_company"?"upcoming-company-options":["application_status","clearinghouse_status"].includes(field)?`upcoming-${field}-options`:undefined}
      onChange={e=>onChange(nullableFields.includes(field)?e.target.value || null:e.target.value)} />
    {field==="drug_test_company" && <datalist id="upcoming-company-options">{refs.companies.map(c=><option key={c.id} value={c.name} />)}</datalist>}
    {["application_status","clearinghouse_status"].includes(field) && <datalist id={`upcoming-${field}-options`}><option value="YES"/><option value="NO"/><option value="SENT"/></datalist>}
  </>;
}

export function CandidateEditor({selection,refs,canEdit,defaultRecruiter,onClose,onSaved}:{selection:EditorSelection;refs:References;canEdit:boolean;defaultRecruiter:string|null;onClose:()=>void;onSaved:(row:Candidate)=>void}) {
  const [base,setBase]=useState<Candidate | null>(null);
  const [draft,setDraft]=useState<CandidateFields>({...EMPTY_CANDIDATE,recruiter_id:defaultRecruiter,arrival_date:selection.date ?? null});
  const [initialDraft]=useState(draft);
  const [allFields,setAllFields]=useState(!selection.field);
  const [saving,setSaving]=useState(false),[error,setError]=useState("");
  const [confirmClose,setConfirmClose]=useState(false),[confirmReload,setConfirmReload]=useState(false),[showHistory,setShowHistory]=useState(false);
  const detail=useQuery({queryKey:candidateKey(selection.id ?? ""),queryFn:()=>fetchCandidate(selection.id!),enabled:!!selection.id,staleTime:0});
  const history=useCandidateHistory(selection.id,showHistory);
  useEffect(()=>{if(detail.data && !base){setBase(detail.data);setDraft(detail.data);}},[detail.data,base]);
  const dirty=Object.keys(changedFields(base ?? initialDraft,draft)).length>0;
  const changedElsewhere=!!base && !!detail.data && detail.data.version!==base.version;
  const close=()=>{if(saving)return;if(dirty)setConfirmClose(true);else onClose();};
  const save=async()=>{
    const problem=validateCandidate(draft);if(problem){setError(problem);return;}
    setSaving(true);setError("");
    try {
      const changes=base?changedFields(base,draft):draft;
      if(base && !Object.keys(changes).length){onClose();return;}
      const row=await saveCandidate(selection.id ?? selection.createId!,changes,base?.version);
      onSaved(row);onClose();
    } catch(e){setError(e instanceof Error?e.message:"Unable to save this entry. Your draft has been kept.");}
    finally{setSaving(false);}
  };
  const reload=async()=>{
    const result=await detail.refetch();
    if(result.data){setBase(result.data);setDraft(result.data);setError("");setConfirmReload(false);}
  };
  const focused=selection.field!;
  const historyValue=(field:string,value:unknown):string=>{
    if(value===null || value===undefined || value==="")return "—";
    if(["recruiter_id","safety_id","dispatcher_id"].includes(field))return refs.staff.find(s=>s.user_id===value)?.full_name || "Previously assigned user";
    if(field==="truck_id")return refs.trucks.find(t=>t.id===value)?.truck_number || "Previously selected truck";
    if(field==="arrival_time")return clockLabel(String(value));
    if(typeof value==="boolean")return value?"Yes":"No";
    return String(value);
  };
  const fields: (keyof CandidateFields)[]=allFields
    ? ["driver_name","phone","arrival_date","arrival_time","tentative","status","recruiter_id","safety_id","dispatcher_id","sales","timing_note","application_status","transport_note","description","mvr","psp","preference","truck_id","truck_terms","drug_test_company","clearinghouse_status","ticket_note"]
    : focused==="truck_id"?["truck_id","truck_terms"]:focused==="arrival_date"?["arrival_date","arrival_time","tentative"]:[focused];
  return <>
    <Sheet open onOpenChange={open=>{if(!open)close();}}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto" onInteractOutside={e=>e.preventDefault()}>
        <SheetHeader>
          <SheetTitle>{selection.id?(base?.driver_name || "Driver details"):"Add upcoming driver"}</SheetTitle>
          <SheetDescription>{allFields?"Candidate information and arrival schedule. All dates and times are Chicago time.":FIELD_LABELS[focused]}</SheetDescription>
        </SheetHeader>
        {selection.id && detail.isPending && <Loader2 className="my-8 h-6 w-6 animate-spin" aria-label="Loading driver details" />}
        {detail.isError && <div role="alert" className="my-4 text-sm text-destructive">Unable to load this entry. <Button variant="outline" onClick={()=>void detail.refetch()}>Retry</Button></div>}
        {(!selection.id || base) && <form className="space-y-5 py-5" onSubmit={e=>{e.preventDefault();void save();}}>
          {!allFields && <Button type="button" size="sm" variant="outline" onClick={()=>setAllFields(true)}>Show all driver details</Button>}
          {changedElsewhere && <p role="status" className="rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">Someone updated this entry. Your draft is preserved. Reload the latest version before saving.</p>}
          {fields.map(field=><div key={field} className="space-y-2">
            <Label htmlFor={`upcoming-${field}`}>{FIELD_LABELS[field]}{["driver_name","phone"].includes(field)?" *":""}</Label>
            <FieldInput field={field} draft={draft} refs={refs} disabled={!canEdit || saving}
              onChange={value=>setDraft(old=>({...old,[field]:value,
                ...(field==="arrival_date" && !value?{arrival_time:null}:{}),
                ...(field==="status"?{row_color:rowColorForStatus(value as CandidateStatus)}:{})}))} />
          </div>)}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="sticky bottom-0 flex flex-wrap gap-2 border-t bg-background py-3">
            {canEdit && <Button type="submit" disabled={saving || changedElsewhere || (!!base && !dirty)}>{saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:null}Save</Button>}
            <Button type="button" variant="outline" disabled={saving} onClick={close}>{canEdit?"Cancel":"Close"}</Button>
            {selection.id && <Button type="button" variant="ghost" disabled={saving} onClick={()=>dirty?setConfirmReload(true):void reload()}>Reload latest</Button>}
          </div>
        </form>}
        {selection.id && <section className="border-t pt-4">
          <Button variant="ghost" onClick={()=>setShowHistory(v=>!v)}>{showHistory?"Hide":"Show"} change history</Button>
          {showHistory && <div className="space-y-3 py-3 text-sm">
            <p className="text-muted-foreground">Latest 20 changes · Chicago time</p>
            {history.isPending && <p>Loading history…</p>}
            {history.isError && <p role="alert">Could not load history.</p>}
            {history.data?.map(entry=><details key={entry.id} className="rounded-md border p-3">
              <summary className="cursor-pointer">{entry.changed_at.replace("T"," ").slice(0,16)} · {entry.actor_name} · {entry.operation==="INSERT"?"Added":"Updated"}</summary>
              <dl className="mt-3 space-y-3">{Object.entries(entry.changes).map(([field,change])=><div key={field}>
                <dt className="font-medium">{FIELD_LABELS[field as keyof CandidateFields] || field}</dt>
                <dd className="whitespace-pre-wrap break-words text-muted-foreground">{historyValue(field,change.before)} → {historyValue(field,change.after)}</dd>
              </div>)}</dl>
            </details>)}
          </div>}
        </section>}
      </SheetContent>
    </Sheet>
    <AlertDialog open={confirmClose} onOpenChange={setConfirmClose}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle><AlertDialogDescription>Your changes have not been saved.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={onClose}>Discard</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
    <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Reload the latest entry?</AlertDialogTitle><AlertDialogDescription>This replaces your unsaved draft with the latest saved information.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Keep editing</AlertDialogCancel><AlertDialogAction onClick={()=>void reload()}>Reload</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </>;
}

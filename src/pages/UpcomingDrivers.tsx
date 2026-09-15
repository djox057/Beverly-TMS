import { useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChevronDown, ChevronLeft, ChevronRight, Copy, Loader2, Phone, Plus, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CandidateEditor, type EditorSelection } from "@/components/upcoming-drivers/CandidateEditor";
import { saveCandidate, useUpcomingDrivers } from "@/components/upcoming-drivers/useUpcomingDrivers";
import { addDays, chicagoToday, clockLabel, COLUMNS, dayLabel, FIELD_LABELS, formatPhone, mondayOf, type CandidateFields, type CandidateSummary, type References } from "@/components/upcoming-drivers/model";

const emptyRefs:References={staff:[],trucks:[],companies:[]};
const statusClass=(s:string)=>s==="Arrived"?"bg-emerald-100 text-emerald-900":s==="Canceled"?"bg-red-100 text-red-900":s==="Scheduled"?"bg-blue-100 text-blue-900":"bg-muted text-foreground";

export default function UpcomingDrivers() {
  const {user,getPrimaryRole}=useAuthContext();
  const [today,setToday]=useState(chicagoToday);
  const [week,setWeek]=useState(()=>mondayOf(chicagoToday()));
  const [view,setView]=useState<"All"|"Upcoming"|"Arrived"|"Archived">("Upcoming");
  const [search,setSearch]=useState("");
  const [filters,setFilters]=useState({recruiter_id:"",safety_id:"",dispatcher_id:""});
  const [collapsed,setCollapsed]=useState<Set<string>>(new Set());
  const [editor,setEditor]=useState<EditorSelection | null>(null);
  const [archiveTarget,setArchiveTarget]=useState<CandidateSummary | null>(null),[archiving,setArchiving]=useState(false);
  const storageKey=`upcoming-drivers-widths:${user?.id}`;
  const defaults=Object.fromEntries(COLUMNS.map(c=>[c.field,c.width]));
  const [widths,setWidths]=useState<Record<string,number>>(defaults);
  const drag=useRef<{field:string;x:number;width:number}|null>(null);
  const {query,references,live,canEdit,canArchive,acceptSaved}=useUpcomingDrivers(week,view==="Archived");
  const refs=references.data ?? emptyRefs;
  const rows=useMemo(()=>query.data ?? [],[query.data]);
  useEffect(()=>{
    // Local clock only; this does not poll the database.
    const timer=setInterval(()=>setToday(chicagoToday()),60000);
    return ()=>clearInterval(timer);
  },[]);
  useEffect(()=>{
    try {const saved=JSON.parse(localStorage.getItem(storageKey) || "{}");
      setWidths(Object.fromEntries(COLUMNS.map(c=>[c.field,Math.max(75,Math.min(500,Number(saved[c.field]) || c.width))])));
    } catch { /* Keep default widths. */ }
  },[storageKey]);
  const resize=(field:string,value:number)=>setWidths(old=>{
    const next={...old,[field]:Math.max(75,Math.min(500,value))};
    try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{/* Local preferences are optional. */}
    return next;
  });
  const names=useMemo(()=>new Map(refs.staff.map(s=>[s.user_id,s.full_name])),[refs.staff]);
  const trucks=useMemo(()=>new Map(refs.trucks.map(t=>[t.id,t.truck_number])),[refs.trucks]);
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter(r=>{
      if(view==="Upcoming" && ["Arrived","Canceled"].includes(r.status))return false;
      if(view==="Arrived" && r.status!=="Arrived")return false;
      if(Object.entries(filters).some(([field,value])=>value && r[field as keyof typeof filters]!==value))return false;
      return !q || [r.driver_name,r.phone,...[r.recruiter_id,r.safety_id,r.dispatcher_id].map(id=>names.get(id ?? "")),trucks.get(r.truck_id ?? ""),r.status]
        .some(value=>value?.toLowerCase().includes(q)) || (/^[+\d\s().-]+$/.test(q) && !!q.replace(/\D/g,"") && r.phone.replace(/\D/g,"").includes(q.replace(/\D/g,"")));
    }).sort((a,b)=>(a.arrival_time || "99").localeCompare(b.arrival_time || "99") || a.driver_name.localeCompare(b.driver_name) || a.id.localeCompare(b.id));
  },[rows,view,filters,search,names,trucks]);
  const days=[...Array.from({length:7},(_,i)=>addDays(week,i)),"unscheduled"];
  const scheduled=rows.filter(r=>!!r.arrival_date);
  const open=(id:string,field?:keyof CandidateFields)=>setEditor({id,field});
  const add=(date:string|null=null)=>setEditor({id:null,createId:crypto.randomUUID(),date});
  const display=(r:CandidateSummary,c:typeof COLUMNS[number])=>{
    if(c.field==="phone") return formatPhone(r.phone);
    if(["recruiter_id","safety_id","dispatcher_id"].includes(c.field)) {
      const id=r[c.field as "recruiter_id"];return id?(names.get(id) || "Assigned user"):"—";
    }
    if(c.field==="truck_id") return [trucks.get(r.truck_id ?? ""),r.truck_terms].filter(Boolean).join(" · ") || "—";
    return String(r[(c.preview ?? c.field) as keyof CandidateSummary] ?? "") || "—";
  };
  const doArchive=async()=>{
    if(!archiveTarget)return;
    setArchiving(true);
    try{acceptSaved(await saveCandidate(archiveTarget.id,{archived:!archiveTarget.archived},archiveTarget.version));setArchiveTarget(null);}
    catch(e){toast({title:"Could not update entry",description:e instanceof Error?e.message:"Please retry.",variant:"destructive"});}
    finally{setArchiving(false);}
  };
  const totalWidth=COLUMNS.reduce((sum,c)=>sum+widths[c.field],0)+65;
  return <div className="flex h-[calc(100dvh-3rem)] min-h-0 flex-col gap-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">Upcoming Drivers</h1><p className="text-xs text-muted-foreground">Chicago dates and times · {live}</p></div>
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={()=>{void query.refetch();void references.refetch();}} disabled={query.isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching?"animate-spin":""}`}/>Refresh</Button>
        {canEdit && <Button size="sm" onClick={()=>add()}><Plus className="mr-2 h-4 w-4"/>Add Driver</Button>}</div>
    </div>
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
      <Button variant="ghost" size="icon" aria-label="Previous week" onClick={()=>setWeek(w=>addDays(w,-7))}><ChevronLeft className="h-4 w-4"/></Button>
      <div className="min-w-52 text-center text-sm font-semibold">{dayLabel(week)} – {dayLabel(addDays(week,6))}, {week.slice(0,4)}</div>
      <Button variant="ghost" size="icon" aria-label="Next week" onClick={()=>setWeek(w=>addDays(w,7))}><ChevronRight className="h-4 w-4"/></Button>
      <Input aria-label="Choose week" type="date" min="2000-01-01" max="2100-12-31" value={week} onChange={e=>{if(e.target.value)try{setWeek(mondayOf(e.target.value));}catch{/* Ignore incomplete input. */}}} className="h-8 w-40"/>
      <Button variant="outline" size="sm" onClick={()=>setWeek(mondayOf(today))}>This Week</Button>
      <div className="ml-auto flex flex-wrap gap-3 px-2 text-xs text-muted-foreground">
        <span>Week total: <b className="text-foreground">{scheduled.length}</b></span>
        <span>Upcoming: <b className="text-foreground">{scheduled.filter(r=>!["Arrived","Canceled"].includes(r.status)).length}</b></span>
        <span>Arrived: <b className="text-foreground">{scheduled.filter(r=>r.status==="Arrived").length}</b></span>
        <span>50/50: <b className="text-foreground">{scheduled.filter(r=>r.tentative).length}</b></span>
        <span>Unscheduled: <b className="text-foreground">{rows.length-scheduled.length}</b></span>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-md bg-muted p-1" role="group" aria-label="Driver view">
        {(["All","Upcoming","Arrived","Archived"] as const).map(v=><Button key={v} variant={view===v?"secondary":"ghost"} size="sm" aria-pressed={view===v} onClick={()=>setView(v)}>{v}</Button>)}
      </div>
      <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground"/><Input aria-label="Search upcoming drivers" placeholder="Name, phone, staff, truck…" value={search} onChange={e=>setSearch(e.target.value)} className="h-9 w-56 pl-8"/></div>
      {([['recruiter_id','recruiting'],['safety_id','safety'],['dispatcher_id','dispatch']] as const).map(([field,role])=><div key={field} className="w-40"><Combobox
        options={refs.staff.filter(s=>s.role===role).map(s=>({value:s.user_id,label:s.full_name || "Unnamed user"}))}
        value={filters[field]} onValueChange={value=>setFilters(old=>({...old,[field]:value}))} placeholder={field==="safety_id"?"All safety staff":`All ${FIELD_LABELS[field].toLowerCase()}s`} className="h-9 text-xs"/></div>)}
      {(search || Object.values(filters).some(Boolean)) && <Button variant="ghost" size="sm" onClick={()=>{setSearch("");setFilters({recruiter_id:"",safety_id:"",dispatcher_id:""});}}>Clear filters</Button>}
    </div>
    {(query.isError || references.isError) && <div role="alert" className="rounded-md border border-destructive p-3 text-sm text-destructive">{query.isError?"Unable to load the board.":"Unable to load staff or truck options."} {String((query.error || references.error)?.message ?? "")} Use Refresh to retry.</div>}
    {query.isPending?<div className="flex items-center justify-center gap-2 py-16"><Loader2 className="h-5 w-5 animate-spin"/>Loading upcoming drivers…</div>:
    <div className="min-h-32 flex-1 overflow-auto rounded-lg border" aria-label="Weekly upcoming drivers board">
      <table className="table-fixed border-collapse text-xs" style={{width:totalWidth}}>
        <colgroup>{COLUMNS.map(c=><col key={c.field} style={{width:widths[c.field]}}/>)}<col style={{width:65}}/></colgroup>
        <thead className="sticky top-0 z-30 bg-muted"><tr>
          {COLUMNS.map((c,i)=><th key={c.field} scope="col" className={`relative h-11 border-b border-r bg-muted px-2 text-left font-semibold ${i<2?"sticky z-40":""}`} style={i<2?{left:i===0?0:widths.recruiter_id}:undefined}>
            <span className="mr-1 text-[10px] font-normal text-muted-foreground">{c.letter}</span>{FIELD_LABELS[c.field]}
            <span role="separator" aria-orientation="vertical" aria-label={`Resize ${FIELD_LABELS[c.field]} column`} aria-valuenow={widths[c.field]} tabIndex={0}
              className="absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none hover:bg-primary/20"
              onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);drag.current={field:c.field,x:e.clientX,width:widths[c.field]};}}
              onPointerMove={e=>{if(drag.current?.field===c.field)resize(c.field,drag.current.width+e.clientX-drag.current.x);}}
              onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
              onKeyDown={e=>{if(e.key==="ArrowLeft" || e.key==="ArrowRight"){e.preventDefault();resize(c.field,widths[c.field]+(e.key==="ArrowRight"?10:-10));}}}/>
          </th>)}<th className="border-b bg-muted px-2"><span className="sr-only">Actions</span></th>
        </tr></thead>
        {days.map(day=>{
          const members=filtered.filter(r=>(r.arrival_date ?? "unscheduled")===day);
          const closed=collapsed.has(day);
          return <tbody key={day}>
            <tr><td colSpan={19} className={`border-y ${day===today?"bg-blue-50 dark:bg-blue-950":"bg-muted/70"}`}>
              <div className="sticky left-0 flex h-10 w-fit items-center gap-2 px-2">
                <button type="button" aria-expanded={!closed} className="flex items-center gap-2 font-semibold" onClick={()=>setCollapsed(old=>{const next=new Set(old);if(next.has(day))next.delete(day);else next.add(day);return next;})}>
                  {closed?<ChevronRight className="h-4 w-4"/>:<ChevronDown className="h-4 w-4"/>}{day==="unscheduled"?"Unscheduled · all weeks":dayLabel(day)} <Badge variant="secondary">{members.length}</Badge>
                  {day===today && <span className="text-blue-700 dark:text-blue-300">Today</span>}
                </button>
                {canEdit && view!=="Archived" && <Button variant="ghost" size="sm" aria-label={`Add driver for ${day}`} onClick={()=>add(day==="unscheduled"?null:day)}><Plus className="h-3 w-3"/></Button>}
              </div>
            </td></tr>
            {!closed && members.map((row,index)=><tr key={row.id} className={index%2?"bg-muted/20":"bg-background"}>
              {COLUMNS.map((c,i)=><td key={c.field} className={`h-10 border-b border-r px-2 ${i<2?"sticky z-10 bg-background":""}`} style={i<2?{left:i===0?0:widths.recruiter_id}:undefined}>
                <div className="flex min-w-0 items-center gap-1">
                  <button type="button" className="min-w-0 flex-1 truncate py-2 text-left hover:text-primary hover:underline" aria-label={`${FIELD_LABELS[c.field]} for ${row.driver_name}`} onClick={()=>open(row.id,c.field)}>
                    {c.field==="status"?<span className={`rounded px-1.5 py-1 ${statusClass(row.status)}`}>{row.status}</span>:display(row,c)}
                  </button>
                  {c.field==="driver_name" && <><button className="shrink-0 text-[10px] text-muted-foreground hover:underline" title="Change arrival schedule" onClick={()=>open(row.id,"arrival_date")}>{clockLabel(row.arrival_time) || "Date"}</button>{row.tentative && <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-900">50/50</span>}</>}
                  {c.field==="phone" && <><a href={`tel:${row.phone.replace(/[^+\d]/g,"")}`} aria-label={`Call ${row.driver_name}`}><Phone className="h-3 w-3"/></a><button aria-label={`Copy phone for ${row.driver_name}`} onClick={()=>void navigator.clipboard.writeText(row.phone).then(()=>toast({title:"Phone copied"})).catch(()=>toast({title:"Could not copy phone",variant:"destructive"}))}><Copy className="h-3 w-3"/></button></>}
                </div>
              </td>)}
              <td className="border-b px-2">{canArchive && <Button size="icon" variant="ghost" aria-label={`${row.archived?"Restore":"Archive"} ${row.driver_name}`} onClick={()=>setArchiveTarget(row)}>{row.archived?<RotateCcw className="h-4 w-4"/>:<Archive className="h-4 w-4"/>}</Button>}</td>
            </tr>)}
            {!closed && !members.length && <tr><td colSpan={19} className="border-b"><p className="sticky left-0 w-fit px-8 py-3 text-muted-foreground">{day==="unscheduled"?"No unscheduled drivers in this view.":"No drivers in this view."}</p></td></tr>}
          </tbody>;
        })}
      </table>
    </div>}
    <p className="text-xs text-muted-foreground">{filtered.length} entries shown · Click a cell for full details or editing. Drag a column edge to resize. Arrival dates and times are entered exactly as Chicago local values.</p>
    {editor && <CandidateEditor key={`${editor.id ?? editor.createId}:${editor.field ?? "all"}`} selection={editor} refs={refs} canEdit={canEdit}
      defaultRecruiter={getPrimaryRole()==="recruiting"?user?.id ?? null:null} onClose={()=>setEditor(null)} onSaved={acceptSaved}/>}
    <AlertDialog open={!!archiveTarget} onOpenChange={open=>{if(!open && !archiving)setArchiveTarget(null);}}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{archiveTarget?.archived?"Restore":"Archive"} {archiveTarget?.driver_name}?</AlertDialogTitle><AlertDialogDescription>{archiveTarget?.archived?"The entry will return to its scheduled day or Unscheduled.":"The entry and its history will be kept in Archived."}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel><AlertDialogAction disabled={archiving} onClick={e=>{e.preventDefault();void doArchive();}}>{archiving?"Saving…":archiveTarget?.archived?"Restore":"Archive"}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </div>;
}

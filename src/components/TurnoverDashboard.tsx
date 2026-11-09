import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { eachMonthOfInterval, endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { Link } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthContext } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { TurnoverRateTooltip } from "@/components/TurnoverRateTooltip";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { chicagoTodayISO } from "@/lib/mileageUpdateStatus";
import { dateFromDay, dayString, monthlyTurnover, previousTurnoverPeriod, summarizeTurnover, turnoverRows, TURNOVER_HISTORY_FROM, type TurnoverData, type TurnoverFilter } from "@/lib/turnoverMetrics";
import type { DateRange } from "react-day-picker";

type Departure = { id: string; driver_id: string; driver_name: string; driver_exists: boolean; dispatcher_name: string; office: string; occurred_on: string; counts_as_turnover: boolean; reason: string | null; source: string; office_estimated: boolean };
type DetailScope = { title: string; office?: string; dispatcherId?: string | null; unassigned?: boolean; includeExcluded?: boolean };
const decimal = (value: number | null) => value == null ? "—" : value.toLocaleString("en-US",{ maximumFractionDigits: 2 });
const percent = (value: number | null) => value == null ? "—" : `${decimal(value)}%`;
async function fetchMetrics(start: string,end: string) {
  const { data,error } = await supabase.rpc("get_turnover_metrics" as never,{ p_start: start,p_end: end } as never);
  if (error) throw new Error(error.message);
  return data as unknown as TurnoverData;
}

export function TurnoverDashboard({ onLegacy }: { onLegacy: (range: DateRange) => void }) {
  const { user } = useAuthContext();
  const today = chicagoTodayISO();
  const monthOptions = useMemo(() => eachMonthOfInterval({ start: dateFromDay("2025-01-01"), end: dateFromDay(today) }).reverse().map(date => ({
    value: format(date, "yyyy-MM"), label: format(date, "MMMM yyyy"), searchText: `${format(date, "MMMM MMM yyyy yyyy-MM")}`,
  })), [today]);
  const [range,setRange] = useState<DateRange>({ from: startOfMonth(dateFromDay(today)),to: dateFromDay(today) });
  const [office,setOffice] = useState("all");
  const [dispatcher,setDispatcher] = useState("all");
  const [mode,setMode] = useState<"office" | "dispatcher">("office");
  const [detail,setDetail] = useState<DetailScope | null>(null);
  const [page,setPage] = useState(0);
  const client = useQueryClient();
  const start = range?.from ? dayString(range.from) : "";
  const end = range?.to ? dayString(range.to) : start;
  const valid = !!start && !!end && start <= end;
  const filter = useMemo<TurnoverFilter>(() => ({ office: office === "all" ? undefined : office,dispatcher: dispatcher === "all" ? undefined : dispatcher }),[office,dispatcher]);
  const main = useQuery({ queryKey: ["turnover-metrics",user?.id,start,end],enabled: !!user && valid,queryFn: () => fetchMetrics(start,end),staleTime: 60_000,gcTime: 5*60_000 });
  const previous = valid ? previousTurnoverPeriod(start,end) : null;
  const comparison = useQuery({ queryKey: ["turnover-metrics",user?.id,previous?.start,previous?.end],enabled: !!user && valid && !!previous && previous.start >= TURNOVER_HISTORY_FROM && previous.start <= today,queryFn: () => fetchMetrics(previous!.start,previous!.end),staleTime: 60_000 });
  const trendStart = valid ? [dayString(startOfMonth(subMonths(dateFromDay(end),5))),TURNOVER_HISTORY_FROM].sort()[1] : TURNOVER_HISTORY_FROM;
  const trend = useQuery({ queryKey: ["turnover-metrics",user?.id,trendStart,end],enabled: !!user && valid && end >= TURNOVER_HISTORY_FROM,queryFn: () => fetchMetrics(trendStart,end),staleTime: 60_000 });
  const metrics = main.data?.available ? summarizeTurnover(main.data,filter) : null;
  const previousMetrics = comparison.data?.available ? summarizeTurnover(comparison.data,filter) : null;
  const rows = useMemo(() => main.data?.available ? turnoverRows(main.data,mode,filter) : [],[main.data,mode,filter]);
  const chart = useMemo(() => trend.data?.available ? monthlyTurnover(trend.data,filter) : [],[trend.data,filter]);
  const offices = [...new Set([...(main.data?.groups || []).map(g => g.office),...(main.data?.dispatchers || []).map(d => d.office)])].sort();
  const dispatcherOptions = new Map<string,string>();
  for (const d of main.data?.dispatchers || []) if (office === "all" || d.office === office) dispatcherOptions.set(d.dispatcher_id,d.dispatcher_name);
  for (const g of main.data?.groups || []) if (office === "all" || g.office === office) dispatcherOptions.set(g.dispatcher_id || "unassigned",g.dispatcher_name);
  const detailQuery = useQuery({ queryKey: ["turnover-events",user?.id,start,end,detail,page],enabled: !!user && !!detail && valid,queryFn: async () => {
    const { data,error } = await supabase.rpc("get_turnover_events" as never,{ p_start: start,p_end: end,p_office: detail?.office || null,p_dispatcher: detail?.dispatcherId || null,p_unassigned: detail?.unassigned || false,p_offset: page*50,p_limit: 50,p_include_excluded: detail?.includeExcluded || false } as never);
    if (error) throw new Error(error.message);
    return data as unknown as { items: Departure[]; total: number };
  },staleTime: 30_000,gcTime: 0 });
  function openDetail(scope: DetailScope) { setPage(0);setDetail(scope); }
  function changeRange(next: DateRange | undefined) { if (next?.from) { setRange(next);setDetail(null);setPage(0); } }
  const legacy = () => onLegacy({ from: range.from,to: range.to || range.from });
  const rateChange = metrics?.rate != null && previousMetrics?.rate != null ? metrics.rate-previousMetrics.rate : null;

  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>Turnover Overview</CardTitle><p className="text-sm text-muted-foreground">Departures / average daily active drivers. Teams count as two drivers. Internal dispatcher transfers are excluded.</p></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-[210px] space-y-1 text-sm"><span>Month</span><Combobox ariaLabel="Turnover month" options={monthOptions} value={start.slice(0,7)} selectedLabel={start ? format(dateFromDay(start), "MMMM yyyy") : undefined} searchPlaceholder="Search month or year…" preserveOrder onValueChange={value => { if (value) { const from=dateFromDay(`${value}-01`);const to=endOfMonth(from);changeRange({ from,to: dayString(to)>today && dayString(from)<=today ? dateFromDay(today) : to }); } }} /></div>
          <div className="space-y-1 text-sm"><span>Custom period</span><DateRangePicker date={range} onDateChange={changeRange} className="min-w-[260px]" /></div>
          <div className="w-[190px] space-y-1 text-sm"><span>Office</span><Combobox ariaLabel="Turnover office" options={[{value:"all",label:"All offices"},...offices.map(o=>({value:o,label:o}))]} value={office} searchPlaceholder="Search offices…" onValueChange={value=>{setOffice(value || "all");setDispatcher("all");setDetail(null);}} /></div>
          <div className="w-[270px] space-y-1 text-sm"><span>Dispatcher</span><Combobox ariaLabel="Turnover dispatcher" options={[{value:"all",label:"All dispatchers"},...[...dispatcherOptions].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=>({value:id,label:name}))]} value={dispatcher} searchPlaceholder="Search dispatchers…" onValueChange={value=>{setDispatcher(value || "all");setMode("dispatcher");setDetail(null);}} /></div>
          <Button variant="outline" onClick={() => { client.invalidateQueries({ queryKey: ["turnover-metrics"] });client.invalidateQueries({ queryKey: ["turnover-events"] }); }}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
        </div>
        {main.isError && <div role="alert" className="text-sm text-destructive">Could not load turnover metrics: {main.error.message} <button onClick={() => main.refetch()} className="underline">Retry</button></div>}
        {main.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading turnover metrics…</p>}
        {main.data && !main.data.available && <div className="rounded-md border p-3 text-sm">{start>today ? "No turnover data is available for future dates." : <>New metrics start April 1, 2026. March and earlier records are unchanged. <Button variant="link" onClick={legacy}>Open existing turnover list</Button></>}</div>}
        {metrics && <>
          {start < TURNOVER_HISTORY_FROM && <div className="rounded-md border p-3 text-sm">Only April 1, 2026 onward is included in these metrics. March remains unchanged. <Button variant="link" onClick={legacy}>View existing list</Button></div>}
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>Measured {main.data!.start} – {main.data!.end}</span><Badge variant="outline">Coverage: {metrics.observedDays}/{metrics.expectedDays} days</Badge>{metrics.estimated && <Badge variant="secondary">Provisional / estimated</Badge>}<span>Departure share always uses all offices for the same period.</span></div>
          {main.data!.months.some(m=>m.legacy_days>0) && <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">Historical figures use preserved existing departures and daily counts. Offices use saved profile data or unambiguous historical office records for former dispatchers. Unrecoverable offices remain Unknown; these estimates may differ from the office at departure. Earlier reactivations may be missing. Recorded office snapshots start {main.data!.tracking_started.slice(0,10)}.</div>}
          {!!main.data!.missing_dates.length && <p className="text-sm text-amber-700 dark:text-amber-400">Missing snapshot days: {main.data!.missing_dates.join(", ")}. Missing days are excluded from the observed-day average; they are not counted as zero.</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Average active drivers" value={decimal(metrics.averageActive)} caption={`Daily average across ${metrics.observedDays} observed days`} />
            <Stat label="Turnover departures" value={String(metrics.departures)} caption={`${metrics.excluded} departures excluded by Count as turnover`} onClick={()=>openDetail({ title: "Turnover departures",office: filter.office,dispatcherId: filter.dispatcher === "unassigned" ? null : filter.dispatcher,unassigned: filter.dispatcher === "unassigned" })} />
            <Stat label="Turnover rate" value={percent(metrics.rate)} caption={rateChange == null ? "No comparable previous-period rate" : `${rateChange>=0?"+":""}${decimal(rateChange)} percentage points vs ${previous!.start} – ${previous!.end}`} />
            <Stat label="Share of all departures" value={percent(metrics.share)} caption="Selected office / dispatcher ÷ all counted departures" />
          </div>
          <div className="flex items-center gap-2"><Button size="sm" variant={mode==="office"?"default":"outline"} onClick={()=>setMode("office")}>By office</Button><Button size="sm" variant={mode==="dispatcher"?"default":"outline"} onClick={()=>setMode("dispatcher")}>By dispatcher</Button>{(office!=="all"||dispatcher!=="all") && <Button variant="ghost" size="sm" onClick={()=>{setOffice("all");setDispatcher("all");}}>Clear filters</Button>}<Button className="ml-auto" variant="outline" size="sm" onClick={()=>openDetail({ title:"All departures, including excluded",office:filter.office,dispatcherId:filter.dispatcher === "unassigned" ? null : filter.dispatcher,unassigned:filter.dispatcher === "unassigned",includeExcluded:true })}>All departure records</Button></div>
          <div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{mode==="office"?"Office":"Dispatcher"}</TableHead>{mode==="dispatcher"&&<TableHead>Office</TableHead>}<TableHead className="text-right">Avg active</TableHead><TableHead className="text-right">Departures</TableHead><TableHead className="text-right">Turnover rate</TableHead><TableHead className="text-right">Share of all</TableHead></TableRow></TableHeader><TableBody>{rows.map(row=><TableRow key={row.key}><TableCell><button className="text-left font-medium hover:underline" onClick={()=>{if(mode==="office"){setOffice(row.key);setDispatcher("all");setMode("dispatcher");}else setDispatcher(row.key);}}>{row.name}</button></TableCell>{mode==="dispatcher"&&<TableCell>{row.office}</TableCell>}<TableCell className="text-right">{decimal(row.averageActive)}</TableCell><TableCell className="text-right"><button className="font-semibold text-primary underline" onClick={()=>openDetail({title:row.name,office:mode==="office"?row.key:filter.office,dispatcherId:mode==="dispatcher"?row.dispatcherId:filter.dispatcher === "unassigned" ? null : filter.dispatcher,unassigned:mode==="dispatcher"?row.dispatcherId==null:filter.dispatcher === "unassigned"})}>{row.departures}</button></TableCell><TableCell className="text-right">{percent(row.rate)}</TableCell><TableCell className="text-right">{percent(row.share)}</TableCell></TableRow>)}</TableBody></Table></div>
        </>}
      </CardContent>
    </Card>
    {metrics && <Card><CardHeader><CardTitle className="text-base">Monthly turnover rate</CardTitle><p className="text-xs text-muted-foreground">Up to six months, using the selected office / dispatcher. The current month is month-to-date.</p></CardHeader><CardContent>{trend.isError?<p role="alert">Could not load the monthly trend. <button className="underline" onClick={()=>trend.refetch()}>Retry</button></p>:<div className="h-64 w-full [--turnover-line:#1d4ed8] dark:[--turnover-line:#60a5fa]"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{top:10,right:15,left:0,bottom:5}}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{fill:"hsl(var(--foreground))",fontSize:12}} stroke="hsl(var(--border))" /><YAxis tickFormatter={v=>`${v}%`} tick={{fill:"hsl(var(--foreground))",fontSize:12}} stroke="hsl(var(--border))" /><Tooltip content={<TurnoverRateTooltip />} cursor={{stroke:"hsl(var(--muted-foreground))",strokeDasharray:"4 4"}} /><Line type="monotone" dataKey="rate" name="Turnover rate" stroke="var(--turnover-line)" strokeWidth={3} dot={{r:4,fill:"var(--turnover-line)",stroke:"hsl(var(--background))",strokeWidth:2}} activeDot={{r:6,stroke:"hsl(var(--foreground))",strokeWidth:2}} connectNulls={false} /></LineChart></ResponsiveContainer></div>}</CardContent></Card>}
    <Dialog open={!!detail} onOpenChange={open=>{if(!open)setDetail(null);}}><DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto"><DialogHeader><DialogTitle>{detail?.title} · {start} – {end}</DialogTitle></DialogHeader>{detailQuery.isLoading?<p>Loading departure records…</p>:detailQuery.isError?<p role="alert" className="text-destructive">{detailQuery.error.message}</p>:<><Table><TableHeader><TableRow><TableHead>Driver</TableHead><TableHead>Departure</TableHead><TableHead>Dispatcher / office</TableHead><TableHead>Reason</TableHead><TableHead>Source</TableHead></TableRow></TableHeader><TableBody>{detailQuery.data?.items.map(e=><TableRow key={e.id}><TableCell>{e.driver_exists?<Link className="text-primary underline" to={`/drivers?record=${e.driver_id}`}>{e.driver_name}</Link>:e.driver_name}{!e.counts_as_turnover&&<Badge variant="outline" className="ml-1">Excluded</Badge>}</TableCell><TableCell>{e.occurred_on}</TableCell><TableCell>{e.dispatcher_name}<div className="text-xs text-muted-foreground">{e.office}</div></TableCell><TableCell className="max-w-[360px] whitespace-pre-wrap">{e.reason||"No reason saved"}</TableCell><TableCell><Badge variant={e.source==="captured"?"default":"secondary"}>{e.source==="captured"?"Recorded":"Historical estimate"}</Badge></TableCell></TableRow>)}</TableBody></Table>{!detailQuery.data?.items.length&&<p className="text-sm text-muted-foreground">No departure records for this selection.</p>}<div className="flex items-center justify-between"><span className="text-sm">{detailQuery.data?.total||0} records · page {page+1}</span><div className="flex gap-2"><Button variant="outline" disabled={!page} onClick={()=>setPage(p=>p-1)}>Previous</Button><Button variant="outline" disabled={(page+1)*50>=(detailQuery.data?.total||0)} onClick={()=>setPage(p=>p+1)}>Next</Button></div></div></>}</DialogContent></Dialog>
  </div>;
}

function Stat({ label,value,caption,onClick }: { label:string;value:string;caption:string;onClick?:()=>void }) {
  return <div className="rounded-lg border bg-background p-4"><p className="text-sm text-muted-foreground">{label}</p>{onClick?<button className="my-1 text-2xl font-semibold text-primary underline" onClick={onClick}>{value}</button>:<p className="my-1 text-2xl font-semibold">{value}</p>}<p className="text-xs text-muted-foreground">{caption}</p></div>;
}

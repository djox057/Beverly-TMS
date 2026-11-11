import { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, Loader2, Maximize2, PaintBucket, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useHolidayTrucks } from '@/hooks/useHolidayTrucks';
import { HOLIDAY_OFFICES, holidayOffice } from '@/lib/holidayOffices';
import { cn } from '@/lib/utils';
import { ROW_COLORS } from '@/components/dailyReport/DailyReportTable';
import { TranslateNoteButton } from '@/components/TranslateNoteButton';
import { HolidayTruckPicker } from './HolidayTruckPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface ReportRow { id: string; truck: string; note: string; color: string | null; persisted: boolean }
const blankRow = (): ReportRow => ({ id: crypto.randomUUID(), truck: '', note: '', color: null, persisted: false });
const priority = (color: string | null) => {
  const index = ['red', 'orange', 'yellow', 'cyan', 'green'].indexOf(color ?? '');
  return index < 0 ? 5 : index;
};
const same = (a: ReportRow, b: ReportRow) => a.truck === b.truck && a.note === b.note && a.color === b.color;
type TruckQuery = ReturnType<typeof useHolidayTrucks>;

function HolidayRow({ initial, index, year, holidaySlug, truckQuery, remove, updateColor, updateTruck }: {
  initial: ReportRow; index: number; year: number; holidaySlug: string; truckQuery: TruckQuery;
  updateTruck: (id: string, truck: string, note: string, color: string | null) => void; remove: (id: string) => void; updateColor: (id: string, color: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const latest = useRef(initial);
  const saved = useRef(initial);
  const persisted = useRef(initial.persisted);
  const queue = useRef(Promise.resolve());
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!same(latest.current, saved.current)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const change = (patch: Partial<Pick<ReportRow, 'truck' | 'note' | 'color'>>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setValue(next);
    setStatus('dirty');
  };

  const save = () => {
    const snapshot = { ...latest.current };
    queue.current = queue.current.then(async () => {
      const patch: { truck?: string; note?: string; color?: string | null } = {};
      if (snapshot.truck !== saved.current.truck) patch.truck = snapshot.truck;
      if (snapshot.note !== saved.current.note) patch.note = snapshot.note;
      if (snapshot.color !== saved.current.color) patch.color = snapshot.color;
      if (!Object.keys(patch).length || (!persisted.current && !snapshot.truck.trim() && !snapshot.note.trim() && !snapshot.color)) {
        if (same(latest.current, snapshot)) setStatus('saved');
        return;
      }
      setStatus('saving');
      try {
        const result = persisted.current
          ? await supabase.from('holiday_report_entries').update(patch).eq('id', initial.id).eq('year', year).eq('holiday_slug', holidaySlug).select('id').single()
          : await supabase.from('holiday_report_entries').insert({ id: initial.id, year, holiday_slug: holidaySlug, truck: snapshot.truck, note: snapshot.note, color: snapshot.color }).select('id').single();
        if (result.error) throw result.error;
        persisted.current = true;
        updateTruck(initial.id, latest.current.truck, latest.current.note, latest.current.color);
        saved.current = snapshot;
        setStatus(same(latest.current, snapshot) ? 'saved' : 'dirty');
      } catch { setStatus('error'); }
    });
  };

  const deleteRow = async () => {
    setDeleting(true);
    await queue.current;
    if (persisted.current) {
      try {
        const { error } = await supabase.from('holiday_report_entries').delete().eq('id', initial.id).eq('year', year).eq('holiday_slug', holidaySlug).select('id').single();
        if (error) throw error;
      } catch {
        toast({ title: 'Could not delete row', description: 'Your note is still here. Please try again.', variant: 'destructive' });
        setDeleting(false);
        return;
      }
    }
    remove(initial.id);
  };
  const setColor = (color: string | null) => {
    change({ color });
    updateColor(initial.id, color);
    setColorOpen(false);
    save();
  };

  return <tr className={cn('group hover:bg-muted/30', ROW_COLORS.find(color => color.value === value.color)?.bg)}>
    <td className="holiday-row-number">{index + 1}</td>
    <td><HolidayTruckPicker value={value.truck} onChange={truck => { change({ truck }); save(); }} trucks={truckQuery.data ?? []} loading={truckQuery.isLoading} error={truckQuery.isError} retry={() => void truckQuery.refetch()} disabled={deleting} /></td>
    <td className="holiday-driver-name">{truckQuery.data?.find(truck => truck.number === value.truck)?.driverName || '—'}</td>
    <td><div className="holiday-note-cell"><Input aria-label={`Note${value.truck ? ` for truck ${value.truck}` : ''}`} value={value.note} disabled={deleting} onChange={event => change({ note: event.target.value })} onBlur={save} maxLength={20000} />
      <button type="button" className="holiday-row-action holiday-expand-note" aria-label="Expand Note" title="Open Note" onClick={() => setNoteDraft(value.note)}><Maximize2 className="h-3.5 w-3.5" /></button>
    </div>
      {status !== 'saved' && <div className="holiday-row-state" role="status">{status === 'saving' ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</> : status === 'error' ? <><span>Could not save.</span><button type="button" onClick={save}>Retry save</button></> : 'Unsaved changes'}</div>}
    </td>
    <td className="holiday-action-cell"><Popover open={colorOpen} onOpenChange={setColorOpen}><PopoverTrigger asChild><button type="button" className="holiday-row-action" aria-label="Color row" disabled={deleting}><PaintBucket className="h-3.5 w-3.5" /></button></PopoverTrigger><PopoverContent className="w-44 p-2 text-xs" align="end">
      {ROW_COLORS.map(color => <button type="button" key={color.value} onClick={() => setColor(color.value)} className={cn('w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted', value.color === color.value && 'bg-muted')}><span className={cn('h-3 w-3 rounded-sm', color.swatch)} />{color.label}</button>)}
      {value.color && <button type="button" onClick={() => setColor(null)} className="w-full text-left px-2 py-1 mt-1 border-t border-border text-muted-foreground">Clear color</button>}
    </PopoverContent></Popover></td>
    <td className="holiday-action-cell"><button type="button" className="holiday-row-action hover:text-destructive" aria-label={`Delete row${value.truck ? ` for truck ${value.truck}` : ''}`} disabled={deleting} onClick={() => persisted.current || value.truck || value.note || value.color ? setConfirmDelete(true) : remove(initial.id)}>{deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this row?</AlertDialogTitle><AlertDialogDescription>The truck number and holiday note will be removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void deleteRow()}>Delete row</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <Dialog open={noteDraft !== null} onOpenChange={open => { if (!open) setNoteDraft(null); }}><DialogContent className="max-w-lg" aria-describedby={undefined}><DialogHeader><DialogTitle>Note{value.truck ? ` — Truck #${value.truck}` : ''}</DialogTitle></DialogHeader>
        <Textarea aria-label="Expanded note" rows={10} maxLength={20000} value={noteDraft ?? ''} onChange={event => setNoteDraft(event.target.value)} />
        <DialogFooter><TranslateNoteButton text={noteDraft ?? ''} onReplace={setNoteDraft} /><Button variant="outline" onClick={() => setNoteDraft(null)}>Cancel</Button><Button onClick={() => { change({ note: noteDraft ?? '' }); setNoteDraft(null); save(); }}>Save</Button></DialogFooter>
      </DialogContent></Dialog>
    </td>
  </tr>;
}

export function HolidayReportTable({ year, holidaySlug }: { year: number; holidaySlug: string }) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [activeOffice, setActiveOffice] = useState('All');
  const [search, setSearch] = useState('');
  const [sortByPriority, setSortByPriority] = useState(false);
  const truckQuery = useHolidayTrucks();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const load = async () => {
      const loaded: ReportRow[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('holiday_report_entries').select('id,truck,note,color').eq('year', year).eq('holiday_slug', holidaySlug).order('created_at').order('id').range(offset, offset + 499);
        if (cancelled) return;
        if (error) { setLoadError(true); setLoading(false); return; }
        loaded.push(...data.map(row => ({ ...row, color: row.color ?? null, persisted: true })));
        if (data.length < 500) break;
      }
      setRows([...loaded, ...Array.from({ length: Math.max(1, 10 - loaded.length) }, blankRow)]);
      setLoading(false);
    };
    void load().catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [year, holidaySlug, attempt]);
  const renderedRows = sortByPriority ? [...rows].sort((a, b) => priority(a.color) - priority(b.color)) : rows;

  const officeFor = (truck: string) => holidayOffice(truckQuery.data?.find(item => item.number === truck)?.dispatcherOffice);
  const offices = [...new Set([...HOLIDAY_OFFICES, ...(truckQuery.data ?? []).map(truck => holidayOffice(truck.dispatcherOffice))])];
  const visibleRows = renderedRows.filter(row => {
    const truck = truckQuery.data?.find(item => item.number === row.truck);
    return (!row.truck || activeOffice === 'All' || officeFor(row.truck) === activeOffice) && `${row.truck} ${truck?.driverName ?? ''} ${row.note}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => {
    if (!a.truck && !a.note && (b.truck || b.note)) return 1;
    if (!b.truck && !b.note && (a.truck || a.note)) return -1;
    if (sortByPriority) return priority(a.color) - priority(b.color);
    const group = (row: ReportRow) => truckQuery.data?.find(item => item.number === row.truck)?.dispatcherName || 'New notes';
    return group(a).localeCompare(group(b));
  });
  const groups = new Map<string, ReportRow[]>();
  for (const row of visibleRows) {
    const dispatcher = truckQuery.data?.find(truck => truck.number === row.truck)?.dispatcherName || 'New notes';
    groups.set(dispatcher, [...(groups.get(dispatcher) ?? []), row]);
  }
  return <section className="holiday-report" aria-label="Holiday truck notes">
    <div className="holiday-office-tabs">{['All', ...offices].map(office => <button type="button" key={office} aria-pressed={activeOffice === office} onClick={() => setActiveOffice(office)}>{office}</button>)}</div>
    <div className="holiday-notes-search"><Input aria-label="Search holiday notes" placeholder="Search by Truck # or Driver..." value={search} onChange={event => setSearch(event.target.value)} /></div>
    {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading notes…</div>
      : loadError ? <div className="p-10 text-center" role="alert"><p className="text-sm text-destructive">Could not load holiday notes.</p><Button className="mt-3" variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      : <div className="holiday-dispatcher-tables">{[...groups].map(([dispatcher, groupRows]) => <section key={dispatcher} className="holiday-dispatcher-section" aria-label={dispatcher}>
        <h3 className="holiday-dispatcher-title">{dispatcher} <span>({groupRows.filter(row => row.truck).length} drivers)</span></h3>
        <table><colgroup><col className="holiday-number-col" /><col className="holiday-truck-col" /><col className="holiday-driver-col" /><col /><col className="holiday-action-col" /><col className="holiday-action-col" /></colgroup><thead><tr><th scope="col">#</th><th scope="col">Truck#</th><th scope="col">Driver</th><th scope="col">Note</th><th scope="col"><button type="button" className="holiday-row-action" aria-label="Sort rows by color priority" aria-pressed={sortByPriority} title="Sort: red, orange, yellow, blue, green. Click again to restore original order." onClick={() => setSortByPriority(value => !value)}><ArrowDownWideNarrow className="h-3.5 w-3.5" /></button></th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{groupRows.map((row, index) => <HolidayRow key={row.id} initial={row} index={index} year={year} holidaySlug={holidaySlug} truckQuery={truckQuery} updateTruck={(id, truck, note, color) => setRows(current => current.map(item => item.id === id ? { ...item, truck, note, color, persisted: true } : item))} remove={id => setRows(current => current.filter(item => item.id !== id))} updateColor={(id, color) => setRows(current => current.map(item => item.id === id ? { ...item, color } : item))} />)}</tbody></table>
      </section>)}</div>}

    <div className="holiday-report-footer"><Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={loading || loadError} onClick={() => setRows(current => [...current, blankRow()])}><Plus className="h-3.5 w-3.5 mr-1" />Add row</Button></div>
  </section>;
}

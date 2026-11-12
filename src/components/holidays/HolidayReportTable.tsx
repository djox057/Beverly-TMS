import { useAuthContext } from '@/contexts/AuthContext';
import { useEffect, useRef, useState } from 'react';
import { ArrowDownWideNarrow, Loader2, Maximize2, PaintBucket } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useHolidayTrucks } from '@/hooks/useHolidayTrucks';
import { holidayOffice } from '@/lib/holidayOffices';
import { cn } from '@/lib/utils';
const ROW_COLORS = [
  { value: 'driving', label: 'Driving', bg: 'bg-green-500/20', swatch: 'bg-green-500' },
  { value: 'not_driving', label: 'Not Driving', bg: 'bg-red-500/20', swatch: 'bg-red-500' },
];
import { TranslateNoteButton } from '@/components/TranslateNoteButton';
import { HolidayTruckPicker } from './HolidayTruckPicker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface ReportRow { id: string; truck: string; note: string; color: string | null; bonus: boolean; persisted: boolean }
const priority = (color: string | null) => {
  const index = ['driving', 'not_driving'].indexOf(color ?? '');
  return index < 0 ? 5 : index;
};
const same = (a: ReportRow, b: ReportRow) => a.truck === b.truck && a.note === b.note && a.color === b.color && a.bonus === b.bonus;
type TruckQuery = ReturnType<typeof useHolidayTrucks>;

function HolidayRow({ initial, index, year, holidaySlug, truckQuery, updateColor, updateTruck }: {
  initial: ReportRow; index: number; year: number; holidaySlug: string; truckQuery: TruckQuery;
  updateTruck: (id: string, truck: string, note: string, color: string | null, bonus: boolean) => void; updateColor: (id: string, color: string | null) => void;
}) {
  const { getPrimaryRole } = useAuthContext();
  const role = getPrimaryRole();
  const canEdit = ['admin', 'manager', 'supervisor', 'dispatch'].includes(role ?? '');
  const canEditBonus = role === 'admin' || role === 'manager';
  const [value, setValue] = useState(initial);
  const latest = useRef(initial);
  const saved = useRef(initial);
  const persisted = useRef(initial.persisted);
  const queue = useRef(Promise.resolve());
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const deleting = false;
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!same(latest.current, saved.current)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const change = (patch: Partial<Pick<ReportRow, 'truck' | 'note' | 'color' | 'bonus'>>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setValue(next);
    setStatus('dirty');
  };

  const save = () => {
    if (!canEdit) return;
    const snapshot = { ...latest.current };
    queue.current = queue.current.then(async () => {
      const patch: { truck?: string; note?: string; color?: string | null; bonus?: boolean } = {};
      if (snapshot.truck !== saved.current.truck) patch.truck = snapshot.truck;
      if (snapshot.note !== saved.current.note) patch.note = snapshot.note;
      if (snapshot.color !== saved.current.color) patch.color = snapshot.color;
      if (canEditBonus && snapshot.bonus !== saved.current.bonus) patch.bonus = snapshot.bonus;
      if (!Object.keys(patch).length || (!persisted.current && !snapshot.truck.trim() && !snapshot.note.trim() && !snapshot.color)) {
        if (same(latest.current, snapshot)) setStatus('saved');
        return;
      }
      setStatus('saving');
      try {
        const result = persisted.current
          ? await supabase.from('holiday_report_entries').update(patch).eq('id', initial.id).eq('year', year).eq('holiday_slug', holidaySlug).select('id').single()
          : await supabase.from('holiday_report_entries').insert({ id: initial.id, year, holiday_slug: holidaySlug, truck: snapshot.truck, note: snapshot.note, color: snapshot.color, ...(canEditBonus ? { bonus: snapshot.bonus } : {}) }).select('id').single();
        if (result.error) throw result.error;
        persisted.current = true;
        updateTruck(initial.id, latest.current.truck, latest.current.note, latest.current.color, latest.current.bonus);
        saved.current = snapshot;
        setStatus(same(latest.current, snapshot) ? 'saved' : 'dirty');
      } catch { setStatus('error'); }
    });
  };

  const setColor = (color: string | null) => {
    change({ color });
    setColorOpen(false);
    save();
  };

  return <tr className={cn('group', ROW_COLORS.find(color => color.value === value.color)?.bg)}>
    <td className="holiday-row-number">{index + 1}</td>
    <td><HolidayTruckPicker value={value.truck} onChange={truck => { change({ truck }); save(); }} trucks={truckQuery.data ?? []} loading={truckQuery.isLoading} error={truckQuery.isError} retry={() => void truckQuery.refetch()} disabled={true} /></td>
    <td className="holiday-driver-name">{truckQuery.data?.find(truck => truck.number === value.truck)?.driverName || '—'}</td>
    <td><div className="holiday-note-cell"><Input aria-label={`Note${value.truck ? ` for truck ${value.truck}` : ''}`} value={value.note} disabled={deleting || !canEdit} onChange={event => change({ note: event.target.value })} onBlur={save} maxLength={20000} />
      <button type="button" className="holiday-row-action holiday-expand-note" aria-label="Expand Note" title="Open Note" onClick={() => setNoteDraft(value.note)}><Maximize2 className="h-3.5 w-3.5" /></button>
    </div>
      {(status === 'dirty' || status === 'error') && <div className="holiday-row-state" role="status">{status === 'error' ? <><span>Could not save.</span><button type="button" onClick={save}>Retry save</button></> : 'Unsaved changes'}</div>}
    </td>
    <td className="holiday-action-cell"><Popover open={colorOpen} onOpenChange={setColorOpen}><PopoverTrigger asChild><button type="button" className="holiday-row-action" aria-label="Driving status" disabled={deleting || !canEdit}><PaintBucket className="h-3.5 w-3.5" /></button></PopoverTrigger><PopoverContent className="w-44 p-2 text-xs" align="end">
      {ROW_COLORS.map(color => <button type="button" key={color.value} onClick={() => setColor(color.value)} className={cn('w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted', value.color === color.value && 'bg-muted')}><span className={cn('h-3 w-3 rounded-sm', color.swatch)} />{color.label}</button>)}
      {value.color && <button type="button" onClick={() => setColor(null)} className="w-full text-left px-2 py-1 mt-1 border-t border-border text-muted-foreground">Clear status</button>}
    </PopoverContent></Popover></td>
    <td className="holiday-bonus-cell"><select aria-label={`Bonus for truck ${value.truck}`} value={value.bonus ? 'yes' : 'no'} disabled={!canEditBonus} onChange={event => { if (!canEditBonus) return; change({ bonus: event.target.value === 'yes' }); save(); }}><option value="no">No</option><option value="yes">Yes</option></select>
      <Dialog open={noteDraft !== null} onOpenChange={open => { if (!open) setNoteDraft(null); }}><DialogContent className="max-w-lg" aria-describedby={undefined}><DialogHeader><DialogTitle>Note{value.truck ? ` — Truck #${value.truck}` : ''}</DialogTitle></DialogHeader>
        <Textarea readOnly={!canEdit} aria-label="Expanded note" rows={10} maxLength={20000} value={noteDraft ?? ''} onChange={event => setNoteDraft(event.target.value)} />
        <DialogFooter>{canEdit && <TranslateNoteButton text={noteDraft ?? ''} onReplace={setNoteDraft} />}<Button variant="outline" onClick={() => setNoteDraft(null)}>Cancel</Button><Button disabled={!canEdit} onClick={() => { change({ note: noteDraft ?? '' }); setNoteDraft(null); save(); }}>Save</Button></DialogFooter>
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
  const [bonusFilter, setBonusFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [sortByPriority, setSortByPriority] = useState(false);
  const truckQuery = useHolidayTrucks();
  const loadedScope = useRef('');
  useEffect(() => {
    let cancelled = false;
    const scope = `${year}/${holidaySlug}/${attempt}`;
    if (loadedScope.current === scope) return;
    setLoading(true);
    setLoadError(false);
    if (!truckQuery.data) { if (truckQuery.isError) { setLoadError(true); setLoading(false); } return; }
    const load = async () => {
      const loaded: ReportRow[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('holiday_report_entries').select('id,truck,note,color,bonus').eq('year', year).eq('holiday_slug', holidaySlug).order('created_at').order('id').range(offset, offset + 499);
        if (cancelled) return;
        if (error) { setLoadError(true); setLoading(false); return; }
        loaded.push(...data.map(row => ({ ...row, color: row.color ?? null, bonus: row.bonus ?? false, persisted: true })));
        if (data.length < 500) break;
      }
      setRows(truckQuery.data.map(truck => {
        const existing = loaded.filter(row => row.truck.trim() === truck.number);
        const first = existing[0];
        const notes = [...new Set(existing.map(row => row.note).filter(Boolean))];
        const note = notes.reduce((text, next) => text.includes(next) ? text : text ? `${text}\n\n${next}` : next, '');
        return { id: first?.id ?? crypto.randomUUID(), truck: truck.number, note, color: first?.color ?? null, bonus: first?.bonus ?? false, persisted: !!first };
      }));
      loadedScope.current = scope;
      setLoading(false);
    };
    void load().catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [year, holidaySlug, attempt, truckQuery.data, truckQuery.isError]);
  const renderedRows = sortByPriority ? [...rows].sort((a, b) => priority(a.color) - priority(b.color)) : rows;

  const officeFor = (truck: string) => holidayOffice(truckQuery.data?.find(item => item.number === truck)?.dispatcherOffice);
  const offices = [...new Set([...(truckQuery.data ?? []).map(truck => holidayOffice(truck.dispatcherOffice))])];
  useEffect(() => {
    const officeTabs = ['Čačak', 'KRAGUJEVAC', 'BG 1st FLOOR', 'BG 4th FLOOR'];
    if (!search.trim() || !officeTabs.includes(activeOffice)) return;
    const query = search.trim().toLowerCase();
    const exact = rows.filter(row => row.truck.toLowerCase() === query);
    const matches = exact.length ? exact : rows.filter(row => {
      const truck = truckQuery.data?.find(item => item.number === row.truck);
      return row.truck.toLowerCase().includes(query) || (truck?.driverName ?? '').toLowerCase().includes(query);
    });
    if (!matches.length || matches.some(row => officeFor(row.truck) === activeOffice)) return;
    const matchingOffices = [...new Set(matches.map(row => officeFor(row.truck)))].filter(office => officeTabs.includes(office));
    if (matchingOffices.length === 1) setActiveOffice(matchingOffices[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeOffice, rows, truckQuery.data]);
  const visibleRows = renderedRows.filter(row => {
    if (bonusFilter !== 'all' && row.bonus !== (bonusFilter === 'yes')) return false;
    if (!truckQuery.data?.some(truck => truck.number === row.truck)) return false;
    const truck = truckQuery.data?.find(item => item.number === row.truck);
    return (activeOffice === 'Driving' ? row.color === 'driving' : activeOffice === 'Not Driving' ? row.color === 'not_driving' : (!row.truck || activeOffice === 'All' || officeFor(row.truck) === activeOffice)) && `${row.truck} ${truck?.driverName ?? ''} ${row.note}`.toLowerCase().includes(search.toLowerCase());
  }).sort((a, b) => {
    if (!a.truck && !a.note && (b.truck || b.note)) return 1;
    if (!b.truck && !b.note && (a.truck || a.note)) return -1;
    if (sortByPriority) return priority(a.color) - priority(b.color);
    const group = (row: ReportRow) => truckQuery.data?.find(item => item.number === row.truck)?.dispatcherName || 'New notes';
    const truckA = truckQuery.data?.find(truck => truck.number === a.truck);
    const truckB = truckQuery.data?.find(truck => truck.number === b.truck);
    const date = (value?: string) => value ? new Date(value).getTime() : 0;
    if (group(a) !== group(b)) return date(truckA?.dispatcherCreatedAt) - date(truckB?.dispatcherCreatedAt) || group(a).localeCompare(group(b));
    return date(truckA?.driverCreatedAt) - date(truckB?.driverCreatedAt) || a.truck.localeCompare(b.truck);
  });
  const groups = new Map<string, ReportRow[]>();
  for (const row of visibleRows) {
    const dispatcher = truckQuery.data?.find(truck => truck.number === row.truck)?.dispatcherName || 'New notes';
    groups.set(dispatcher, [...(groups.get(dispatcher) ?? []), row]);
  }
  return <section className="holiday-report" aria-label="Holiday truck notes">
    <div className="holiday-office-tabs">{['All', ...offices.filter(office => !['Other', 'BEOGRAD', 'Recovery'].includes(office)), 'Driving', 'Not Driving'].map(office => <button type="button" key={office} aria-pressed={activeOffice === office} onClick={() => setActiveOffice(office)}>{office}</button>)}</div>
    <div className="holiday-notes-search"><Input aria-label="Search holiday notes" placeholder="Search by Truck # or Driver..." value={search} onChange={event => setSearch(event.target.value)} /><label className="flex items-center gap-2 text-sm whitespace-nowrap">Bonus<select aria-label="Filter by bonus" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={bonusFilter} onChange={event => setBonusFilter(event.target.value as 'all' | 'yes' | 'no')}><option value="all">All</option><option value="yes">Yes</option><option value="no">No</option></select></label><span className="holiday-truck-count" role="status">{loading ? 'Loading trucks…' : `${visibleRows.length} trucks`}</span></div>
    {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading notes…</div>
      : loadError ? <div className="p-10 text-center" role="alert"><p className="text-sm text-destructive">Could not load holiday notes.</p><Button className="mt-3" variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      : <div className="holiday-dispatcher-tables">{[...groups].map(([dispatcher, groupRows]) => <section key={dispatcher} className="holiday-dispatcher-section" aria-label={dispatcher}>
        <h3 className="holiday-dispatcher-title">{dispatcher} <span>({groupRows.filter(row => row.truck).length} drivers)</span></h3>
        <table><colgroup><col className="holiday-number-col" /><col className="holiday-truck-col" /><col className="holiday-driver-col" /><col /><col className="holiday-action-col" /><col className="holiday-bonus-col" /></colgroup><thead><tr><th scope="col">#</th><th scope="col">Truck#</th><th scope="col">Driver</th><th scope="col">Note</th><th scope="col"><button type="button" className="holiday-row-action" aria-label="Sort rows by color priority" aria-pressed={sortByPriority} title="Sort by Driving / Not Driving. Click again to restore original order." onClick={() => setSortByPriority(value => !value)}><ArrowDownWideNarrow className="h-3.5 w-3.5" /></button></th><th scope="col" style={{ textAlign: 'center' }}>Bonus</th></tr></thead><tbody>{groupRows.map((row, index) => <HolidayRow key={row.id} initial={row} index={index} year={year} holidaySlug={holidaySlug} truckQuery={truckQuery} updateTruck={(id, truck, note, color, bonus) => setRows(current => current.map(item => item.id === id ? { ...item, truck, note, color, bonus, persisted: true } : item))} updateColor={(id, color) => setRows(current => current.map(item => item.id === id ? { ...item, color } : item))} />)}</tbody></table>
      </section>)}</div>}


  </section>;
}

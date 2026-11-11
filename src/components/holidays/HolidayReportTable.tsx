import { useEffect, useRef, useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

interface ReportRow { id: string; truck: string; note: string; persisted: boolean }
const blankRow = (): ReportRow => ({ id: crypto.randomUUID(), truck: '', note: '', persisted: false });

function HolidayRow({ initial, year, holidaySlug, remove }: { initial: ReportRow; year: number; holidaySlug: string; remove: (id: string) => void }) {
  const [value, setValue] = useState(initial);
  const latest = useRef(initial);
  const saved = useRef(initial);
  const persisted = useRef(initial.persisted);
  const queue = useRef(Promise.resolve());
  const [status, setStatus] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.truck !== saved.current.truck || latest.current.note !== saved.current.note) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const change = (field: 'truck' | 'note', text: string) => {
    const next = { ...latest.current, [field]: text };
    latest.current = next;
    setValue(next);
    setStatus('dirty');
  };

  const save = () => {
    const snapshot = { ...latest.current };
    queue.current = queue.current.then(async () => {
      const patch: { truck?: string; note?: string } = {};
      if (snapshot.truck !== saved.current.truck) patch.truck = snapshot.truck;
      if (snapshot.note !== saved.current.note) patch.note = snapshot.note;
      if (!Object.keys(patch).length || (!persisted.current && !snapshot.truck.trim() && !snapshot.note.trim())) {
        if (latest.current.truck === snapshot.truck && latest.current.note === snapshot.note) setStatus('saved');
        return;
      }
      setStatus('saving');
      try {
        const result = persisted.current
          ? await supabase.from('holiday_report_entries').update(patch).eq('id', initial.id).eq('year', year).eq('holiday_slug', holidaySlug).select('id').single()
          : await supabase.from('holiday_report_entries').insert({ id: initial.id, year, holiday_slug: holidaySlug, truck: snapshot.truck, note: snapshot.note }).select('id').single();
        if (result.error) throw result.error;
        persisted.current = true;
        saved.current = snapshot;
        setStatus(latest.current.truck === snapshot.truck && latest.current.note === snapshot.note ? 'saved' : 'dirty');
      } catch {
        setStatus('error');
      }
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

  return <tr>
    <td><div className="holiday-truck-cell">
      <Input aria-label="Truck number" placeholder="Truck#" value={value.truck} disabled={deleting} onChange={event => change('truck', event.target.value)} onBlur={save} maxLength={80} />
      <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Delete row${value.truck ? ` for truck ${value.truck}` : ''}`} disabled={deleting} onClick={() => persisted.current || value.truck || value.note ? setConfirmDelete(true) : remove(initial.id)}>{deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}</Button>
    </div></td>
    <td><div className="holiday-note-cell"><Textarea aria-label={`Note${value.truck ? ` for truck ${value.truck}` : ''}`} placeholder="Add a holiday note…" value={value.note} disabled={deleting} onChange={event => change('note', event.target.value)} onBlur={save} maxLength={20000} rows={Math.min(8, Math.max(1, value.note.split('\n').length))} />
      {status !== 'saved' && <div className="holiday-row-state" role="status">{status === 'saving' ? <><Loader2 className="h-3 w-3 animate-spin" />Saving…</> : status === 'error' ? <><span>Could not save.</span><button type="button" onClick={save}>Retry save</button></> : 'Unsaved changes'}</div>}
    </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Delete this row?</AlertDialogTitle><AlertDialogDescription>The truck number and holiday note will be removed.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void deleteRow()}>Delete row</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </td>
  </tr>;
}

export function HolidayReportTable({ year, holidaySlug }: { year: number; holidaySlug: string }) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const load = async () => {
      // Page explicitly so reports larger than the API's row limit are preserved.
      const loaded: ReportRow[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await supabase.from('holiday_report_entries').select('id,truck,note').eq('year', year).eq('holiday_slug', holidaySlug).order('created_at').order('id').range(offset, offset + 499);
        if (cancelled) return;
        if (error) { setLoadError(true); setLoading(false); return; }
        loaded.push(...data.map(row => ({ ...row, persisted: true })));
        if (data.length < 500) break;
      }
      setRows([...loaded, ...Array.from({ length: Math.max(1, 10 - loaded.length) }, blankRow)]);
      setLoading(false);
    };
    void load().catch(() => { if (!cancelled) { setLoadError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [year, holidaySlug, attempt]);

  return <section className="holiday-report" aria-label="Holiday truck notes">
    <div className="holiday-report-heading"><div><h2>Holiday truck notes</h2><p>One shared table. Notes save when you leave a cell.</p></div><Button variant="outline" size="sm" disabled={loading || loadError} onClick={() => setRows(current => [...current, blankRow()])}><Plus className="h-4 w-4 mr-1" />Add row</Button></div>
    {loading ? <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Loading notes…</div>
      : loadError ? <div className="p-10 text-center" role="alert"><p className="text-sm text-destructive">Could not load holiday notes.</p><Button className="mt-3" variant="outline" onClick={() => setAttempt(value => value + 1)}>Try again</Button></div>
      : <table><thead><tr><th scope="col">Truck#</th><th scope="col">Note</th></tr></thead><tbody>{rows.map(row => <HolidayRow key={row.id} initial={row} year={year} holidaySlug={holidaySlug} remove={id => setRows(current => current.filter(item => item.id !== id))} />)}</tbody></table>}
    <div className="holiday-report-footer">Notes belong to this holiday in {year}.</div>
  </section>;
}

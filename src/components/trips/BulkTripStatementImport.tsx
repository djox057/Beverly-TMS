import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { readStatement, statementKey } from "@/lib/tripStatement";
import { BulkStatementRow, ImportDriver, ImportTruck, duplicateStatementKeys, extractPdfStatementDetails, resolveStatementTarget, statementWeekEnd } from "@/lib/bulkTripStatements";
import { insertTripStatement } from "@/lib/saveTripStatement";
import { toast } from "sonner";

function LocalStatementLink({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url ? <a className="text-primary underline break-all" href={url} target="_blank" rel="noopener noreferrer" aria-label={`View ${file.name}`}>{file.webkitRelativePath || file.name}</a> : <span>{file.name}</span>;
}

async function loadImportReferences() {
  // Include inactive drivers/trucks and every company. Never depend on the current Trips search.
  const drivers: ImportDriver[] = [];
  const trucks: ImportTruck[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("drivers").select("id,name,company_name").order("id").range(offset, offset + 499);
    if (error) throw error;
    drivers.push(...data);
    if (data.length < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("trucks").select("truck_number").order("id").range(offset, offset + 499);
    if (error) throw error;
    trucks.push(...data);
    if (data.length < 500) break;
  }
  return { drivers, trucks };
}

export function BulkTripStatementImport({ canEdit }: { canEdit: boolean }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BulkStatementRow[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [ignored, setIgnored] = useState(0);
  const readVersion = useRef(0);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const references = useQuery({ queryKey: ["bulk-trip-statement-references"], queryFn: loadImportReferences, enabled: open && canEdit, staleTime: 0 });
  const drivers = references.data?.drivers || [];
  const trucks = references.data?.trucks || [];
  const weeks = [...new Set(rows.filter(r => !r.saved).map(r => r.weekStart).filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w)))].sort();
  const existing = useQuery({
    queryKey: ["trip-week-statements", "bulk-import", weeks], enabled: open && canEdit && !reading && weeks.length > 0,
    queryFn: async () => {
      const keys = new Set<string>();
      for (let start = 0; start < weeks.length; start += 50) {
        for (let offset = 0; ; offset += 500) {
          const { data, error } = await supabase.from("trip_week_statements").select("truck_number,driver_name,week_start")
            .in("week_start", weeks.slice(start, start + 50)).order("id").range(offset, offset + 499);
          if (error) throw error;
          data.forEach(s => keys.add(statementKey(s.truck_number, s.driver_name, s.week_start)));
          if (data.length < 500) break;
        }
      }
      return keys;
    }, staleTime: 0,
  });
  const duplicates = duplicateStatementKeys(rows, drivers, trucks);
  const rowState = (row: BulkStatementRow) => {
    const target = resolveStatementTarget(row, drivers, trucks);
    const issues = [...target.issues];
    if (duplicates.has(target.key)) issues.push("Duplicate in this folder — select only one");
    if (existing.data?.has(target.key)) issues.push("Statement already exists — skipped");
    return { ...target, issues };
  };
  const busy = reading || saving;
  const checked = references.isSuccess && !references.isFetching && (weeks.length === 0 || (existing.isSuccess && !existing.isFetching));
  const ready = rows.filter(r => r.selected && !r.saved && !rowState(r).issues.length);
  const update = (id: string, patch: Partial<BulkStatementRow>) => setRows(current => current.map(row => row.id === id ? { ...row, saveError: undefined, ...patch } : row));

  const selectFiles = async (files: File[]) => {
    if (savingRef.current || !canEdit) return;
    const version = ++readVersion.current;
    const pdfs = files.filter(file => file.name.toLowerCase().endsWith(".pdf"));
    setRows([]); setIgnored(files.length - pdfs.length); setReading(true);
    const next: BulkStatementRow[] = [];
    try {
      for (let index = 0; index < pdfs.length; index++) {
        if (!mounted.current || version !== readVersion.current) return;
        const file = pdfs[index];
        setProgress(`Reading ${index + 1} of ${pdfs.length}`);
        const row: BulkStatementRow = { id: crypto.randomUUID(), file, driverName: "", truckNumber: "", weekStart: "", weekEnd: "", companyName: "", amount: "", selected: true };
        try {
          const result = await readStatement(file);
          if (!result.lines?.some(line => line.trim())) throw new Error("PDF has no readable text. Upload a text-based statement.");
          const details = extractPdfStatementDetails(result.lines, result.amount);
          Object.assign(row, details, { amount: details.amount === null ? "" : details.amount.toFixed(2) });
        } catch (error) { row.readError = error instanceof Error ? error.message : "Could not read PDF."; row.selected = false; }
        next.push(row);
        if (mounted.current && version === readVersion.current) setRows([...next]);
      }
    } finally { if (mounted.current && version === readVersion.current) { setReading(false); setProgress(""); } }
  };

  const save = async () => {
    if (!canEdit || busy || savingRef.current || !checked || !ready.length) return;
    savingRef.current = true; setSaving(true);
    let saved = 0;
    const pending = ready.map(row => ({ row, target: rowState(row) }));
    try {
      for (let i = 0; i < pending.length; i++) {
        const { row, target } = pending[i];
        if (mounted.current) setProgress(`Saving ${i + 1} of ${pending.length}`);
        try {
          await insertTripStatement(row.file, { ...target, amount: target.amount! });
          saved++;
          if (mounted.current) update(row.id, { saved: true, selected: false });
        } catch (error) {
          if (mounted.current) update(row.id, { saveError: error instanceof Error ? error.message : "Could not save statement." });
        }
      }
      if (mounted.current) {
        if (saved) toast.success(`${saved} statement${saved === 1 ? "" : "s"} imported`);
        if (saved < pending.length) toast.error(`${pending.length - saved} statement(s) failed. Review the rows and retry.`);
      }
    } finally {
      savingRef.current = false;
      await client.invalidateQueries({ queryKey: ["trip-week-statements"] });
      if (mounted.current) { setSaving(false); setProgress(""); }
    }
  };

  if (!canEdit) return null;
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><FolderUp className="h-4 w-4 mr-2" />Bulk import salaries</Button>
    <Dialog open={open} onOpenChange={value => {
      if (savingRef.current) return;
      if (!value) { readVersion.current++; setReading(false); setProgress(""); }
      setOpen(value);
    }}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Bulk import salaries</DialogTitle>
          <DialogDescription>Select a folder of PDF statements from any company. Review the driver, truck, Tuesday–Monday pay period, and final paid amount before importing.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-4">
          <label className="space-y-1 text-sm">Choose folder
            <Input aria-label="Choose salary folder" type="file" multiple accept=".pdf" {...{ webkitdirectory: "", directory: "" }} disabled={busy} onChange={e => { void selectFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
          </label>
          <label className="space-y-1 text-sm">Or choose PDF files
            <Input aria-label="Choose salary PDFs" type="file" multiple accept=".pdf" disabled={busy} onChange={e => { void selectFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />
          </label>
        </div>
        <p className="text-sm text-muted-foreground">The pay period inside each PDF determines its week. Paid amount is the final NET PAY / Check Amount after deductions. Existing statements are skipped; replace them individually in Trips. Importing does not change paid checkboxes.</p>
        {ignored > 0 && <p className="text-sm">Ignored {ignored} non-PDF file(s).</p>}
        {(references.isError || existing.isError) && <p role="alert" className="text-destructive">Could not check drivers, trucks, or existing statements. <Button variant="link" disabled={busy} onClick={() => { void references.refetch(); if (weeks.length) void existing.refetch(); }}>Retry checks</Button></p>}
        {open && references.isPending && <p role="status">Loading drivers and trucks…</p>}
        {progress && <p role="status">{progress}</p>}
        {rows.length > 0 && <div className="overflow-auto max-h-[50vh] border rounded-md">
          <datalist id="salary-import-drivers">{drivers.filter(d => d.name).map(d => <option key={d.id} value={d.name!}>{d.company_name || ""}</option>)}</datalist>
          <datalist id="salary-import-trucks">{trucks.map(t => <option key={t.truck_number} value={t.truck_number} />)}</datalist>
          <table className="w-full text-sm"><thead className="bg-muted sticky top-0"><tr>
            {["Import", "PDF / company", "Driver", "Truck", "Week starting", "Week ending", "Paid amount ($)", "Status"].map(label => <th key={label} className="text-left p-2">{label}</th>)}
          </tr></thead><tbody>{rows.map((row, index) => {
            const state = rowState(row);
            const locked = busy || row.saved;
            return <tr key={row.id} className="border-t align-top">
              <td className="p-2"><input type="checkbox" aria-label={`Import ${row.file.name}`} checked={row.selected} disabled={locked || !!row.readError} onChange={e => update(row.id, { selected: e.target.checked })} /></td>
              <td className="p-2 min-w-44"><LocalStatementLink file={row.file} /><div className="text-xs text-muted-foreground">{row.companyName || "Company not printed"}</div></td>
              <td className="p-2 min-w-44"><Input aria-label={`Driver ${index + 1}`} list="salary-import-drivers" value={row.driverName} disabled={locked} onChange={e => update(row.id, { driverName: e.target.value })} /></td>
              <td className="p-2 min-w-28"><Input aria-label={`Truck ${index + 1}`} list="salary-import-trucks" value={row.truckNumber} disabled={locked} onChange={e => update(row.id, { truckNumber: e.target.value })} /></td>
              <td className="p-2"><Input aria-label={`Week starting ${index + 1}`} type="date" value={row.weekStart} disabled={locked} onChange={e => update(row.id, { weekStart: e.target.value, weekEnd: statementWeekEnd(e.target.value) })} /></td>
              <td className="p-2"><Input aria-label={`Week ending ${index + 1}`} type="date" value={row.weekEnd} disabled={locked} onChange={e => update(row.id, { weekEnd: e.target.value })} /></td>
              <td className="p-2 min-w-32"><Input aria-label={`Paid amount ${index + 1}`} inputMode="decimal" value={row.amount} disabled={locked} onChange={e => update(row.id, { amount: e.target.value })} /></td>
              <td className="p-2 min-w-48" aria-live="polite">{row.saved ? "Imported" : <>
                {row.saveError && <p className="text-destructive">{row.saveError}</p>}
                {state.issues.length ? <span className="text-amber-700 dark:text-amber-400">{state.issues.join(". ")}</span> : checked ? (row.selected ? "Ready" : "Skipped") : "Checking…"}
              </>}</td>
            </tr>;
          })}</tbody></table>
        </div>}
        <div className="flex flex-wrap justify-between items-center gap-3">
          <p className="text-sm">{rows.filter(r => r.saved).length} imported · {ready.length} ready · {rows.filter(r => !r.saved && (!r.selected || rowState(r).issues.length > 0)).length} skipped / need review</p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={() => { readVersion.current++; setReading(false); setProgress(""); setOpen(false); }}>Close</Button>
            <Button disabled={busy || !checked || ready.length === 0} onClick={() => void save()}>Import {ready.length} statement{ready.length === 1 ? "" : "s"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkBook } from "xlsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { parseStatementAmount, readStatement, STATEMENT_BUCKET } from "@/lib/tripStatement";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

export type TripStatement = Tables<"trip_week_statements">;
export type StatementTarget = { truckNumber: string; driverName: string; weekStart: string; statement?: TripStatement; mode: "view" | "upload" };

export function TripStatementDialog({ target, canEdit, onClose }: { target: StatementTarget; canEdit: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [sheets, setSheets] = useState<{ name: string; rows: string[][] }[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mode, setMode] = useState(target.mode);
  const readVersion = useRef(0);
  useEffect(() => () => { readVersion.current++; }, []);

  const showWorkbook = async (workbook: WorkBook) => {
    const XLSX = await import("xlsx");
    return workbook.SheetNames.map(name => {
      const sheet = workbook.Sheets[name];
      // Bound preview size; originals remain available via Download.
      const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
      range.e.r = Math.min(range.e.r, range.s.r + 999);
      range.e.c = Math.min(range.e.c, range.s.c + 29);
      return { name, rows: XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", range }) };
    });
  };

  useEffect(() => {
    let cancelled = false;
    if (mode !== "view" || !target.statement) return;
    setReading(true);
    setError("");
    (async () => {
      const { data, error } = await supabase.storage.from(STATEMENT_BUCKET).createSignedUrl(target.statement!.file_path, 3600);
      if (error) throw error;
      if (cancelled) return;
      setUrl(data.signedUrl);
      if (target.statement!.file_name.toLowerCase().endsWith(".xlsx")) {
        const response = await fetch(data.signedUrl);
        if (!response.ok) throw new Error("Could not load statement.");
        const XLSX = await import("xlsx");
        const rows = await showWorkbook(XLSX.read(await response.arrayBuffer(), { type: "array" }));
        if (!cancelled) setSheets(rows);
      }
    })().catch(e => { if (!cancelled) setError(e.message || "Could not open statement."); })
      .finally(() => { if (!cancelled) setReading(false); });
    return () => { cancelled = true; };
  }, [mode, target.statement]);

  const selectFile = async (selected: File | null) => {
    const version = ++readVersion.current;
    setFile(selected);
    setAmount("");
    setError("");
    if (!selected) { setReading(false); return; }
    setReading(true);
    try {
      const result = await readStatement(selected);
      if (version !== readVersion.current) return;
      setAmount(result.amount === null ? "" : result.amount.toFixed(2));
      if (result.amount === null) setError("Final payment total could not be identified. Enter the amount shown at the end of this statement.");
    } catch (e) {
      if (version === readVersion.current) setError(e instanceof Error ? e.message : "Could not read statement. Enter its final payment amount.");
    } finally { if (version === readVersion.current) setReading(false); }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!canEdit || !file || reading) throw new Error("Choose a statement first.");
      const paidAmount = parseStatementAmount(amount);
      if (paidAmount === null) throw new Error("Enter a valid paid amount.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!["pdf", "xlsx"].includes(extension || "") || file.size > 20 * 1024 * 1024) throw new Error("Choose a PDF or XLSX file up to 20 MB.");
      const path = `${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from(STATEMENT_BUCKET).upload(path, file, {
        contentType: extension === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      if (uploadError) throw uploadError;
      const payload = { truck_number: target.truckNumber, driver_name: target.driverName, week_start: target.weekStart,
        paid_amount: paidAmount, file_name: file.name, file_path: path };
      // Insert vs compare-and-swap update prevents silently overwriting another accountant's upload.
      const result = target.statement
        ? await supabase.from("trip_week_statements").update(payload).eq("id", target.statement.id).eq("file_path", target.statement.file_path).select("id").single()
        : await supabase.from("trip_week_statements").insert(payload).select("id").single();
      if (result.error) {
        await supabase.storage.from(STATEMENT_BUCKET).remove([path]);
        throw new Error("Could not save statement. Refresh Trips and try again.");
      }
      if (target.statement) {
        const cleanup = await supabase.storage.from(STATEMENT_BUCKET).remove([target.statement.file_path]);
        if (cleanup.error) console.error("Old statement cleanup failed", cleanup.error);
      }
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["trip-week-statements"] });
      toast.success("Statement and paid amount saved");
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className={mode === "view" ? "max-w-6xl max-h-[90vh] overflow-auto" : "max-w-lg"}>
      <DialogHeader>
        <DialogTitle>{mode === "upload" ? (target.statement ? "Replace statement" : "Add statement") : "Weekly statement"}</DialogTitle>
        <DialogDescription>#{target.truckNumber} · {target.driverName} · Week starting {target.weekStart}</DialogDescription>
      </DialogHeader>
      {mode === "upload" ? <>
        <label className="space-y-2">Statement (PDF or XLSX)
          <Input type="file" accept=".pdf,.xlsx" disabled={save.isPending} onChange={e => void selectFile(e.target.files?.[0] || null)} />
        </label>
        {reading && <p role="status">Reading statement…</p>}
        <label className="space-y-2">Paid amount ($)
          <Input aria-label="Paid amount" inputMode="decimal" value={amount} disabled={reading || save.isPending} onChange={e => setAmount(e.target.value)} placeholder="Final NET PAY / Check Amount" />
        </label>
        <p className="text-sm text-muted-foreground">Check the final amount after deductions, fuel, and credits before saving. Negative and zero totals are supported.</p>
        {error && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
          <Button disabled={!canEdit || !file || reading || save.isPending || parseStatementAmount(amount) === null} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save statement"}</Button>
        </div>
      </> : <>
        <div className="flex items-center justify-between gap-3">
          <span className="truncate">{target.statement?.file_name}</span>
          <div className="flex gap-2">
            {url && <Button asChild variant="outline"><a href={url} target="_blank" rel="noopener noreferrer" download={target.statement?.file_name}>Download</a></Button>}
            {canEdit && <Button onClick={() => setMode("upload")}>Replace statement</Button>}
          </div>
        </div>
        {reading && <p role="status">Loading statement…</p>}
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {url && target.statement?.file_name.toLowerCase().endsWith(".pdf") && <iframe title="Statement PDF" src={url} className="w-full h-[65vh] border rounded" />}
        {sheets.length > 0 && <>
          {sheets.length > 1 && <select aria-label="Worksheet" value={sheetIndex} onChange={e => setSheetIndex(Number(e.target.value))}>{sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}</select>}
          <div className="overflow-auto max-h-[65vh] border rounded"><table className="text-xs border-collapse w-full"><tbody>
            {sheets[sheetIndex]?.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className="border px-2 py-1 whitespace-pre-wrap min-w-20">{cell}</td>)}</tr>)}
          </tbody></table></div>
        </>}
      </>}
    </DialogContent>
  </Dialog>;
}

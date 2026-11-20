import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthContext } from "@/contexts/AuthContext";
import { loadLawyerFields } from "@/hooks/useLawyerRegister";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { columns, highlightStyles, webLink, type Column, type RoadRecord, type Sheet } from "@/lib/roadsides";

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

const caseSections = [
  { title: "Driver and equipment", keys: ["driver", "company", "truck"] },
  { title: "Citation", keys: ["state", "city", "oos", "convictions"] },
  { title: "Legal contacts and court", keys: ["lawyer", "assistant", "phone", "address", "court", "returned"] },
  { title: "Notes", keys: ["extra"] },
];

export function RoadsideEditor({ sheet, record, onClose }: { sheet: Sheet; record?: RoadRecord; onClose: () => void }) {
  const [fields, setFields] = useState(record?.fields ?? {});
  const [links, setLinks] = useState(record?.links ?? {});
  const [color, setColor] = useState("preserve");
  const [id] = useState(() => record?.id ?? crypto.randomUUID());
  const cache = useQueryClient();
  const schema = columns[sheet];
  const addCase = sheet === "Lawyers" && !record;
  const { user } = useAuthContext();
  const priorCases = useQuery({
    queryKey: ["roadsides", "Lawyers", user?.id, "search"],
    enabled: addCase,
    queryFn: ({ signal }) => loadLawyerFields(signal),
  });
  const choices = useMemo(() => {
    return Object.fromEntries(schema.map(col => {
      const unique = new Map<string, string>();
      for (const entry of [...(col.options ?? []), ...(priorCases.data ?? []).map(row => row.fields[col.key])]) {
        const value = entry?.trim();
        if (value && !unique.has(value.toLowerCase())) unique.set(value.toLowerCase(), value);
      }
      return [col.key, [...unique.values()].sort((a, b) => a.localeCompare(b))];
    }));
  }, [schema, priorCases.data]);
  const save = useMutation({
    mutationFn: async () => {
      if (!Object.values(fields).some(value => value.trim())) throw new Error("Enter a value before saving.");
      for (const [key, value] of Object.entries(links)) {
        if (value && value !== record?.links[key] && !webLink(value)) {
          throw new Error(`Enter a valid web address for ${schema.find(col => col.key === key)?.label}.`);
        }
      }
      const values = {
        fields: Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== "").map(([key, value]) => {
          if (addCase && (key === "company" || key === "oos")) {
            return [key, choices[key].find(choice => choice.toLowerCase() === value.trim().toLowerCase()) ?? value.trim()];
          }
          return [key, value];
        })),
        links: Object.fromEntries(Object.entries(links).filter(([, value]) => value !== "")),
        highlights: color === "preserve" ? (record?.highlights ?? {}) :
          color === "none" ? {} : Object.fromEntries(schema.map(col => [col.key, color])),
      };
      const table = supabase.from("roadside_records");
      const result = record
        ? await table.update(values).eq("id", id).eq("updated_at", record.updated_at).select("id").maybeSingle()
        : await table.insert({ ...values, sheet, id }).select("id").single();
      if (result.error) throw new Error(result.error.message);
      if (!result.data) {
        await cache.invalidateQueries({ queryKey: ["roadsides", sheet] });
        throw new Error("This record changed. Close the editor and reopen it to see the latest values.");
      }
    },
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["roadsides", sheet] });
      onClose();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!save.isPending) save.mutate();
  }

  function renderField(col: Column) {
    const value = fields[col.key] ?? "";
    const set = (next: string) => setFields(prev => ({ ...prev, [col.key]: next }));
    const inputId = "road-" + col.key;
    if (addCase) {
      return <div key={col.key} className={`min-w-0 space-y-1 ${col.multiline || col.key === "address" ? "sm:col-span-full" : ""}`}>
        <Label htmlFor={inputId}>{col.label}</Label>
        <Input id={inputId} list={inputId + "-options"} autoComplete="off"
          value={value} onChange={event => set(event.target.value)} />
        <datalist id={inputId + "-options"}>
          {choices[col.key].map(option => <option key={option} value={option} />)}
        </datalist>
      </div>;
    }
    const legacyDate = col.key === "inspection_date" && record?.fields.inspection_date &&
      !/^\d{4}-\d{2}-\d{2}$/.test(record.fields.inspection_date);
    return <div key={col.key} className="space-y-1">
        <Label htmlFor={inputId}>{col.label}</Label>
        {col.options ? <select className={selectClass} id={inputId} value={value} onChange={e => set(e.target.value)}>
          <option value="">—</option>
          {value && !col.options.includes(value) && <option value={value}>{value}</option>}
          {col.options.map(option => <option key={option}>{option}</option>)}
        </select> : col.multiline ? <Textarea id={inputId} value={value} onChange={e => set(e.target.value)} /> :
          <Input id={inputId} type={col.key === "inspection_date" && !legacyDate ? "date" : "text"}
            value={value} onChange={e => set(e.target.value)} />}
        {legacyDate && <p className="text-xs text-muted-foreground">Original workbook value. Use YYYY-MM-DD for a correction.</p>}
        {record?.notes[col.key] && <p className="whitespace-pre-line text-xs text-muted-foreground">{record.notes[col.key]}</p>}
      </div>;
  }

  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader><DialogTitle>{record ? "Edit" : "Add"} {sheet === "ALL" ? "inspection" : "lawyer case"}</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        {addCase && <>
          <p className="text-sm text-muted-foreground">Type to search previous answers or enter your own.</p>
          {caseSections.map(section => <fieldset key={section.title} className="min-w-0 rounded-md border px-3 pb-3 pt-1">
            <legend className="px-1 text-sm font-semibold">{section.title}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {section.keys.map(key => renderField(schema.find(col => col.key === key)!))}
            </div>
          </fieldset>)}
        </>}
        <div className="grid gap-4 sm:grid-cols-2">
          {!addCase && schema.map(renderField)}
          {sheet === "Lawyers" && <div className="space-y-1">
            <Label htmlFor="road-color">Row highlight</Label>
            <select id="road-color" className={selectClass} value={color} onChange={e => setColor(e.target.value)}>
              <option value="preserve">{record ? "Keep current highlights" : "Default"}</option>
              <option value="none">None</option>
              {Object.keys(highlightStyles).map(key => <option key={key} value={key}>{key[0].toUpperCase() + key.slice(1)}</option>)}
            </select>
          </div>}
        </div>
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">Document links</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{schema.map(col =>
            <div key={col.key}><Label htmlFor={"url-" + col.key}>{col.label} link</Label>
              <Input id={"url-" + col.key} value={links[col.key] ?? ""} placeholder="https://"
                onChange={e => setLinks(prev => ({ ...prev, [col.key]: e.target.value }))} />
            </div>)}</div>
        </details>
        {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
